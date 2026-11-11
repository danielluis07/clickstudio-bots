import { afterAll, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { createConversationStats } from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";

let db: Database;
afterAll(() => closeTestDatabase(db));

// The home page reads up to 90 days of a busy Tenant on every visit, so each
// query must reach its rows through an index, never a whole table. The tables
// are empty here, so sequential scans are disabled to make the planner show
// which index each query can use.
test("the home page stats read its period through indexes", async () => {
  const queries: { query: string; params: unknown[] }[] = [];
  db = await createTestDatabase({ logQuery: (query, params) => queries.push({ query, params }) });
  const { scope, clock } = await seedLiveBot(db);
  queries.length = 0;
  await createConversationStats({
    db,
    clock,
    readBusinessHours: async () => ({
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    }),
  }).read(scope, 90);

  await queryTestDatabase(db, "set enable_seqscan = off");
  const used = new Set<string>();
  const scanned = new Set<string>();
  for (const { query, params } of queries) {
    const plan = await queryTestDatabase<{ "QUERY PLAN": string }>(db, `explain ${query}`, params);
    for (const { "QUERY PLAN": line } of plan) {
      for (const [, index] of line.matchAll(/Index (?:Only )?Scan (?:using|on) (\w+)/g))
        used.add(index);
      for (const [, table] of line.matchAll(/Seq Scan on (\w+)/g)) scanned.add(table);
    }
  }
  expect([...scanned]).toEqual([]);
  expect([...used]).toEqual(
    expect.arrayContaining([
      "message_tenant_id_sent_at_idx",
      "handoff_event_tenant_id_occurred_at_idx",
      "conversation_contact_id_idx",
    ]),
  );
});
