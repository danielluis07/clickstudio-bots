import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { eq } from "drizzle-orm";
import { conversation } from "@/db/schema";
import { createLiveBot, type BotJob } from "@/modules/bot";
import { recordInboundTextMessage } from "@/modules/conversations";
import { createQStashJobVerifier } from "@/platform/qstash";
import { createBotJobRoute } from "@/server/bot-jobs";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestBotAllowance, createTestUsageMeter } from "@/test/support/bot";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { qstashSigningKeys, signQStashRequest } from "@/test/support/qstash";

const url = "https://bots.example.com/api/jobs/run-bot-turn";
let db: Database;
let jobs: ReturnType<typeof createBotJobRoute>;
let conversationId: string;
beforeAll(async () => {
  db = await createTestDatabase();
  const { route, clock } = await seedLiveBot(db);
  conversationId = (await recordInboundTextMessage(db, route, {
    wamid: "signed-job",
    from: "5511999990001",
    profileName: null,
    text: "Oi",
    sentAt: clock.now(),
  }))!;
  const bot = createLiveBot({
    db,
    clock,
    model: null,
    queue: createTestJobQueue<BotJob>(),
    notifier: createTestNotifier(),
    getSender: createTestWhatsAppSender,
    meter: createTestUsageMeter(),
    allowance: createTestBotAllowance(),
  });
  jobs = createBotJobRoute({ bot, url, verifier: createQStashJobVerifier(qstashSigningKeys) });
  await db
    .update(conversation)
    .set({ botLeaseToken: "holder", botLeaseUntil: new Date(clock.now().getTime() + 120_000) })
    .where(eq(conversation.id, conversationId));
});
afterAll(() => closeTestDatabase(db));

const request = (body: string, signature?: string) =>
  new Request(url, {
    method: "POST",
    body,
    headers: signature ? { "upstash-signature": signature } : {},
  });

test("Bot job signatures bind both body and destination; malformed jobs are rejected", async () => {
  const body = JSON.stringify({ conversationId });
  expect((await jobs.POST(request(body))).status).toBe(401);
  expect(
    (await jobs.POST(request(body, signQStashRequest({ url: `${url}-other`, body })))).status,
  ).toBe(401);
  expect((await jobs.POST(request(`${body} `, signQStashRequest({ url, body })))).status).toBe(401);
  for (const invalid of ["invalid json", JSON.stringify({ conversationId, tenantId: "foreign" })])
    expect(
      (await jobs.POST(request(invalid, signQStashRequest({ url, body: invalid })))).status,
    ).toBe(400);
});

test("a valid job retries a held lease and acknowledges a missing Conversation", async () => {
  for (const [id, status] of [
    [conversationId, 503],
    ["missing", 200],
  ] as const) {
    const body = JSON.stringify({ conversationId: id });
    expect((await jobs.POST(request(body, signQStashRequest({ url, body })))).status).toBe(status);
  }
  expect((await createBotJobRoute(null).POST(request("{}"))).status).toBe(503);
});
