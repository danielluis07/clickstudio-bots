import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/database";
import { inboxEvent } from "@/db/schema";
import type { InboxEventInput } from "@/modules/webhook-inbox/deliveries";

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

  async settle(id: string, outcome:
    | { status: "processed"; processedAt: Date }
    | { status: "ignored"; ignoredReason: "unknown_channel" | "unsupported_event"; processedAt: Date }) {
    await db.update(inboxEvent).set(outcome)
      .where(and(eq(inboxEvent.id, id), eq(inboxEvent.status, "pending")));
  },
});
