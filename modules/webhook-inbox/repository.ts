import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { inboxEvent } from "@/db/schema";
import type { InboxEventInput } from "@/modules/webhook-inbox/deliveries";
import type { ErrorClass } from "@/platform/diagnostics";

export const createInboxRepository = (db: Database) => ({
  async insert(events: InboxEventInput[], receivedAt: Date) {
    await db.insert(inboxEvent).values(events.map((event) => ({ ...event, receivedAt })))
      .onConflictDoNothing({ target: inboxEvent.dedupeKey });
  },

  // Includes events stored by an earlier delivery whose enqueue failed.
  async findPendingIds(dedupeKeys: string[]) {
    const found = await db.select({ id: inboxEvent.id }).from(inboxEvent)
      .where(and(inArray(inboxEvent.dedupeKey, dedupeKeys), eq(inboxEvent.status, "pending")));
    return found.map(({ id }) => id);
  },

  async find(id: string) {
    const [found] = await db.select({
      status: inboxEvent.status,
      phoneNumberId: inboxEvent.phoneNumberId,
      payload: inboxEvent.payload,
    }).from(inboxEvent).where(eq(inboxEvent.id, id)).limit(1);
    return found ?? null;
  },

  async listFailures(offset: number) {
    const events = await db.select({
      id: inboxEvent.id, status: inboxEvent.status, errorClass: inboxEvent.errorClass,
      receivedAt: inboxEvent.receivedAt, failedAt: inboxEvent.failedAt,
    }).from(inboxEvent)
      .where(and(inArray(inboxEvent.status, ["pending", "failed"]), isNotNull(inboxEvent.errorClass)))
      .orderBy(asc(inboxEvent.receivedAt), asc(inboxEvent.id)).limit(51).offset(offset);
    return { events: events.slice(0, 50), hasMore: events.length > 50 };
  },

  async recordFailure(ids: string[], errorClass: ErrorClass, failedAt: Date) {
    await db.update(inboxEvent).set({ errorClass, failedAt })
      .where(and(inArray(inboxEvent.id, ids), inArray(inboxEvent.status, ["pending", "failed"])));
  },

  async fail(id: string, failedAt: Date) {
    const [failed] = await db.update(inboxEvent).set({
      status: "failed", failedAt,
      errorClass: sql`coalesce(${inboxEvent.errorClass}, 'JobDeliveryError')`,
    }).where(and(eq(inboxEvent.id, id), inArray(inboxEvent.status, ["pending", "failed"]), isNull(inboxEvent.alertedAt)))
      .returning({ errorClass: inboxEvent.errorClass });
    return failed ?? null;
  },

  async markAlerted(id: string, alertedAt: Date) {
    await db.update(inboxEvent).set({ alertedAt }).where(eq(inboxEvent.id, id));
  },

  async pruneBefore(cutoff: Date) {
    const deleted = await db.delete(inboxEvent).where(lt(inboxEvent.receivedAt, cutoff)).returning({ id: inboxEvent.id });
    return deleted.length;
  },

  async settle(id: string, processedAt: Date, outcome:
    | { status: "processed" }
    | { status: "ignored"; ignoredReason: NonNullable<typeof inboxEvent.$inferSelect.ignoredReason> }) {
    await db.update(inboxEvent).set({ ...outcome, processedAt, errorClass: null, failedAt: null })
      .where(and(eq(inboxEvent.id, id), inArray(inboxEvent.status, ["pending", "failed"])));
  },
});
