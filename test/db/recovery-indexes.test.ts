import { afterAll, expect, test } from "bun:test";
import { createBotAllowance, createLiveBot, type BotJob } from "@/modules/bot";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import type { Database } from "@/db/database";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestMailer } from "@/test/support/mailer";
import { createTestModel } from "@/test/support/model";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestUsageMeter } from "@/test/support/bot";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";

let db: Database;
afterAll(() => closeTestDatabase(db));

// Every sweep runs these scans across all Tenants, so none may read a whole
// table. The tables are empty here, so sequential scans are disabled to make
// the planner show which index each query can use.
test("the sweep's recovery scans use their partial indexes", async () => {
  const queries: { query: string; params: unknown[] }[] = [];
  db = await createTestDatabase({ logQuery: (query, params) => queries.push({ query, params }) });
  const clock = createTestClock(new Date("2026-11-09T12:00:00Z"));
  const notifier = createTestNotifier();
  const bot = createLiveBot({
    db,
    clock,
    model: createTestModel(),
    queue: createTestJobQueue<BotJob>(),
    notifier,
    getSender: () => createTestWhatsAppSender(),
    meter: createTestUsageMeter(),
    allowance: createBotAllowance({ db, clock, mailer: createTestMailer() }),
  });
  const inbox = createWebhookInbox({
    db,
    clock,
    queue: createTestJobQueue(),
    notifier,
    appSecret: "secret",
  });
  await bot.sweep();
  await inbox.requeueStalled();

  await queryTestDatabase(db, "set enable_seqscan = off");
  const used = new Set<string>();
  for (const { query, params } of queries) {
    const plan = await queryTestDatabase<{ "QUERY PLAN": string }>(db, `explain ${query}`, params);
    for (const { "QUERY PLAN": line } of plan)
      for (const [, index] of line.matchAll(/Index (?:Only )?Scan (?:using|on) (\w+)/g))
        used.add(index);
  }
  expect([...used]).toEqual(
    expect.arrayContaining([
      "conversation_bot_lease_until_idx",
      "message_pending_bot_reply_created_at_idx",
      "message_unanswered_contact_sent_at_idx",
      "inbox_event_status_received_at_idx",
    ]),
  );
});
