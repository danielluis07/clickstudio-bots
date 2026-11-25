import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { inboxEvent } from "@/db/schema";
import { pruneInboxEvents } from "@/modules/webhook-inbox";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(() => closeTestDatabase(db));

const now = new Date("2026-11-24T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

// A backlog larger than one deletion batch still empties in one daily run, so
// a task held to the role's statement timeout never falls behind for good.
test("the daily task deletes a backlog of expired raw events larger than one batch", async () => {
  await db.insert(inboxEvent).values(
    Array.from({ length: 2_500 }, (_, index) => ({
      dedupeKey: `expired:${index}`,
      field: "messages",
      payload: {},
      receivedAt: daysAgo(31),
    })),
  );
  await db
    .insert(inboxEvent)
    .values({ dedupeKey: "recent", field: "messages", payload: {}, receivedAt: daysAgo(29) });

  expect(await pruneInboxEvents(db, { now: () => now })).toBe(2_500);
  expect(await db.select({ dedupeKey: inboxEvent.dedupeKey }).from(inboxEvent)).toEqual([
    { dedupeKey: "recent" },
  ]);
});
