import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { inboxEvent } from "@/db/schema";
import type { InboxEventInput } from "@/modules/webhook-inbox/deliveries";
import type { ErrorClass } from "@/platform/diagnostics";

export const createInboxRepository = (db: Database) => ({
  async insert(events: InboxEventInput[], receivedAt: Date) {
    await db
      .insert(inboxEvent)
      .values(events.map((event) => ({ ...event, receivedAt })))
      .onConflictDoNothing({ target: inboxEvent.dedupeKey });
  },

  // Includes events stored by an earlier delivery whose enqueue failed.
  async findPendingIds(dedupeKeys: string[]) {
    const found = await db
      .select({ id: inboxEvent.id })
      .from(inboxEvent)
      .where(and(inArray(inboxEvent.dedupeKey, dedupeKeys), eq(inboxEvent.status, "pending")));
    return found.map(({ id }) => id);
  },

  // Pending events received by `receivedBy` that never failed, or whose last
  // failure and last replay were both by `failedBy`. Oldest first, from the
  // (status, received_at) index.
  async listPendingBefore(
    { receivedBy, failedBy }: { receivedBy: Date; failedBy: Date },
    limit: number,
  ) {
    const found = await db
      .select({ id: inboxEvent.id })
      .from(inboxEvent)
      .where(
        and(
          eq(inboxEvent.status, "pending"),
          lte(inboxEvent.receivedAt, receivedBy),
          or(isNull(inboxEvent.failedAt), lte(inboxEvent.failedAt, failedBy)),
          or(isNull(inboxEvent.retriedAt), lte(inboxEvent.retriedAt, failedBy)),
        ),
      )
      .orderBy(asc(inboxEvent.receivedAt), asc(inboxEvent.id))
      .limit(limit);
    return found.map(({ id }) => id);
  },

  // Failed, unalerted events due for automatic replay number `n`: those with
  // `n` replays so far whose last failure was by `failedBy[n]`. Oldest first.
  async listRetryDue(failedBy: readonly Date[], limit: number) {
    const found = await db
      .select({ id: inboxEvent.id })
      .from(inboxEvent)
      .where(
        and(
          eq(inboxEvent.status, "failed"),
          isNull(inboxEvent.alertedAt),
          or(
            ...failedBy.map((cutoff, retries) =>
              and(eq(inboxEvent.autoRetries, retries), lte(inboxEvent.failedAt, cutoff)),
            ),
          ),
        ),
      )
      .orderBy(asc(inboxEvent.receivedAt), asc(inboxEvent.id))
      .limit(limit);
    return found.map(({ id }) => id);
  },

  // Puts failed events back to pending for one more automatic replay. Returns
  // the ids it moved, so a concurrent sweep cannot count a replay twice.
  async markRetried(ids: string[], retriedAt: Date) {
    if (ids.length === 0) return [];
    const moved = await db
      .update(inboxEvent)
      .set({
        status: "pending",
        retriedAt,
        autoRetries: sql`${inboxEvent.autoRetries} + 1`,
      })
      .where(
        and(
          inArray(inboxEvent.id, ids),
          eq(inboxEvent.status, "failed"),
          isNull(inboxEvent.alertedAt),
        ),
      )
      .returning({ id: inboxEvent.id });
    return moved.map(({ id }) => id);
  },

  // An administrator's bulk replay: puts listed failures (all of them, or the
  // given ids) back to pending with a fresh set of automatic replays and a
  // fresh alert. Returns the ids it moved.
  async resetFailures(ids: string[] | null, retriedAt: Date) {
    const moved = await db
      .update(inboxEvent)
      .set({ status: "pending", retriedAt, autoRetries: 0, alertedAt: null })
      .where(
        and(
          inArray(inboxEvent.status, ["pending", "failed"]),
          isNotNull(inboxEvent.errorClass),
          ids ? inArray(inboxEvent.id, ids) : undefined,
        ),
      )
      .returning({ id: inboxEvent.id });
    return moved.map(({ id }) => id);
  },

  async find(id: string) {
    const [found] = await db
      .select({
        status: inboxEvent.status,
        phoneNumberId: inboxEvent.phoneNumberId,
        payload: inboxEvent.payload,
        receivedAt: inboxEvent.receivedAt,
      })
      .from(inboxEvent)
      .where(eq(inboxEvent.id, id))
      .limit(1);
    return found ?? null;
  },

  async listFailures(page: number) {
    const pageSize = 50;
    const events = await db
      .select({
        id: inboxEvent.id,
        status: inboxEvent.status,
        errorClass: inboxEvent.errorClass,
        receivedAt: inboxEvent.receivedAt,
        failedAt: inboxEvent.failedAt,
        alertedAt: inboxEvent.alertedAt,
        autoRetries: inboxEvent.autoRetries,
      })
      .from(inboxEvent)
      .where(
        and(inArray(inboxEvent.status, ["pending", "failed"]), isNotNull(inboxEvent.errorClass)),
      )
      .orderBy(asc(inboxEvent.receivedAt), asc(inboxEvent.id))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    return { events: events.slice(0, pageSize), hasMore: events.length > pageSize };
  },

  async recordFailure(ids: string[], errorClass: ErrorClass, failedAt: Date) {
    await db
      .update(inboxEvent)
      .set({ errorClass, failedAt })
      .where(and(inArray(inboxEvent.id, ids), inArray(inboxEvent.status, ["pending", "failed"])));
  },

  async fail(id: string, failedAt: Date) {
    const [failed] = await db
      .update(inboxEvent)
      .set({
        status: "failed",
        failedAt,
        errorClass: sql`coalesce(${inboxEvent.errorClass}, 'JobDeliveryError')`,
      })
      .where(
        and(
          eq(inboxEvent.id, id),
          inArray(inboxEvent.status, ["pending", "failed"]),
          isNull(inboxEvent.alertedAt),
        ),
      )
      .returning({ errorClass: inboxEvent.errorClass, autoRetries: inboxEvent.autoRetries });
    return failed ?? null;
  },

  async markAlerted(id: string, alertedAt: Date) {
    await db.update(inboxEvent).set({ alertedAt }).where(eq(inboxEvent.id, id));
  },

  async pruneBefore(cutoff: Date) {
    const deleted = await db
      .delete(inboxEvent)
      .where(lt(inboxEvent.receivedAt, cutoff))
      .returning({ id: inboxEvent.id });
    return deleted.length;
  },

  async settle(
    id: string,
    processedAt: Date,
    outcome:
      | { status: "processed" }
      | {
          status: "ignored";
          ignoredReason: NonNullable<typeof inboxEvent.$inferSelect.ignoredReason>;
        },
  ) {
    await db
      .update(inboxEvent)
      .set({ ...outcome, processedAt, errorClass: null, failedAt: null })
      .where(and(eq(inboxEvent.id, id), inArray(inboxEvent.status, ["pending", "failed"])));
  },
});
