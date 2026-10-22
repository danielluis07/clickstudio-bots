import { afterEach, expect, spyOn, test } from "bun:test";
import type { Database } from "@/db/database";
import { sql } from "drizzle-orm";
import { botReplyUsage, message } from "@/db/schema";
import { createBotAllowance, recordBotReplyUsage } from "@/modules/bot";
import type { ChannelRoute } from "@/modules/channels";
import {
  createConversationRepository,
  deleteContact,
  recordBotReplySent,
  recordInboundTextMessage,
} from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestMailer } from "@/test/support/mailer";
import { createTestNotifier } from "@/test/support/notifier";
import { createResendMailer } from "@/platform/resend-mailer";

let db: Database;
const acknowledgeReply = (scope: ChannelRoute, id: string, wamid: string, at: Date) =>
  recordBotReplySent(db, scope, id, wamid, (tx) => recordBotReplyUsage(tx, scope, at));
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

test("80% warns the owner exactly once per period across service instances", async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  const mailer = createTestMailer();
  const first = createBotAllowance({ db, clock, mailer });
  const second = createBotAllowance({ db, clock, mailer });
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 3999 });
  await first.notifyWarning({ scope: route, conversationId: "unused" });
  expect(mailer.sent).toHaveLength(0);
  // Fixture for an acknowledged 4,000th reply; the counting boundary is tested separately.
  await db.update(botReplyUsage).set({ replies: 4000 });
  expect(await first.status(scope)).toMatchObject({ used: 4000, warning: true });
  await Promise.allSettled(
    [first, second, first].map((service) =>
      service.notifyWarning({ scope: route, conversationId: "unused" }),
    ),
  );
  expect(mailer.sent).toHaveLength(1);
  expect(mailer.sent[0]).toMatchObject({
    to: `${scope.userId.slice(6)}@example.com`,
    subject: "Seu Bot atingiu 80% das respostas do mês",
  });
  expect(mailer.sent[0]!.text).toContain("4.000 / 5.000");
  clock.set(new Date("2026-11-01T03:00:00Z"));
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-11-01", replies: 4000 });
  await second.notifyWarning({ scope: route, conversationId: "unused" });
  expect(mailer.sent).toHaveLength(2);
  expect(mailer.sent[1]!.idempotencyKey).not.toBe(mailer.sent[0]!.idempotencyKey);
});

test("only an acknowledged Bot reply counts, once, in the São Paulo month of acknowledgment", async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  const allowance = createBotAllowance({ db, clock, mailer: createTestMailer() });
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: "inbound",
    from: "5511999990001",
    profileName: null,
    text: "Oi",
    sentAt: clock.now(),
  }))!;
  clock.set(new Date("2026-11-01T02:59:59Z"));
  const [pending] = await db
    .insert(message)
    .values({
      tenantId: scope.tenantId,
      conversationId,
      origin: "bot",
      direction: "outbound",
      type: "text",
      text: "Olá",
      status: "pending",
      sentAt: clock.now(),
    })
    .returning();
  expect(await allowance.status(scope)).toMatchObject({
    used: 0,
    limit: 5000,
    period: "2026-10-01",
  });
  await acknowledgeReply(route, pending.id, "outbound", clock.now());
  await acknowledgeReply(route, pending.id, "outbound", clock.now());
  expect(await allowance.status(scope)).toMatchObject({
    used: 1,
    warning: false,
    exhausted: false,
  });
  clock.set(new Date("2026-11-01T03:00:00Z"));
  await acknowledgeReply(route, pending.id, "outbound", clock.now());
  expect(await allowance.status(scope)).toMatchObject({ used: 0, period: "2026-11-01" });
});

test("Member messages, templates, imported history, and unacknowledged sends consume no replies", async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  const allowance = createBotAllowance({ db, clock, mailer: createTestMailer() });
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: "contact",
    from: "5511999990001",
    profileName: null,
    text: "Oi",
    sentAt: clock.now(),
  }))!;
  const rows = await db
    .insert(message)
    .values(
      [
        { origin: "dashboard" as const, type: "text" as const },
        { origin: "app" as const, type: "text" as const },
        { origin: "bot" as const, type: "text" as const, imported: true },
        { origin: "bot" as const, type: sql`'template'` },
        { origin: "bot" as const, type: "text" as const, status: "failed" as const },
      ].map((entry) => ({
        tenantId: scope.tenantId,
        conversationId,
        direction: "outbound" as const,
        status: "pending" as const,
        sentAt: clock.now(),
        ...entry,
      })),
    )
    .returning();
  for (const row of rows.slice(0, 4))
    await acknowledgeReply(route, row.id, `ack-${row.id}`, clock.now());
  expect(await allowance.status(scope)).toMatchObject({ used: 0 });
});

test("failed warning delivery is retried by recovery even after rollover, without duplicate emails", async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  const mailer = createTestMailer();
  const allowance = createBotAllowance({ db, clock, mailer });
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 4000 });
  mailer.failNext();
  await expect(allowance.notifyWarning({ scope: route, conversationId: "unused" })).rejects.toThrow(
    "Mailer unavailable",
  );
  clock.set(new Date("2026-11-01T03:00:00Z"));
  await createBotAllowance({ db, clock, mailer }).retryWarnings();
  await allowance.retryWarnings();
  expect(mailer.sent).toHaveLength(1);
  expect(mailer.sent[0]!.idempotencyKey).toEndWith("/2026-10-01");
  expect(await allowance.status(scope)).toMatchObject({ used: 0 });
});

test("a job retry during an unsent warning's live lease remains retryable until the claim expires", async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  const mailer = createTestMailer();
  const allowance = createBotAllowance({ db, clock, mailer });
  await db.insert(botReplyUsage).values({
    tenantId: scope.tenantId,
    period: "2026-10-01",
    replies: 4000,
    warningClaimToken: "interrupted-job",
    warningTo: "owner@example.com",
    warningLeaseUntil: new Date(clock.now().getTime() + 60_000),
  });
  await expect(allowance.notifyWarning({ scope: route, conversationId: "unused" })).rejects.toThrow(
    "in progress",
  );
  clock.advance(60_001);
  await allowance.notifyWarning({ scope: route, conversationId: "unused" });
  await allowance.notifyWarning({ scope: route, conversationId: "unused" });
  expect(mailer.sent).toHaveLength(1);
});

test("an acknowledgment after midnight belongs to the new month, survives Contact deletion, and leaves another Tenant untouched", async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  const other = await seedLiveBot(db);
  const allowance = createBotAllowance({ db, clock, mailer: createTestMailer() });
  clock.set(new Date("2027-01-01T02:59:59Z"));
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: "year-end",
    from: "5511999990001",
    profileName: null,
    text: "Oi",
    sentAt: clock.now(),
  }))!;
  const [pending] = await db
    .insert(message)
    .values({
      tenantId: scope.tenantId,
      conversationId,
      origin: "bot",
      direction: "outbound",
      type: "text",
      status: "pending",
      sentAt: clock.now(),
    })
    .returning();
  clock.set(new Date("2027-01-01T03:00:00Z"));
  await acknowledgeReply(route, pending.id, "new-year", clock.now());
  expect(await allowance.status(scope)).toMatchObject({ used: 1, period: "2027-01-01" });
  const repository = createConversationRepository(db, scope);
  const found = (await repository.getConversation(conversationId))!;
  await deleteContact({
    db,
    scope,
    clock,
    notifier: createTestNotifier(),
    contactId: found.contact.id,
  });
  expect(await allowance.status(scope)).toMatchObject({ used: 1 });
  expect(await allowance.status(other.scope)).toMatchObject({ used: 0 });
});

test("warning retries use the same Resend idempotency key and email payload", async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 4000 });
  const requests: Request[] = [];
  const network = spyOn(globalThis, "fetch").mockImplementation((async (url, init) => {
    requests.push(new Request(url as string, init));
    return new Response(null, { status: requests.length === 1 ? 503 : 200 });
  }) as typeof fetch);
  try {
    const allowance = createBotAllowance({
      db,
      clock,
      mailer: createResendMailer({ apiKey: "test-key", from: "bot@example.com" }),
    });
    await expect(
      allowance.notifyWarning({ scope: route, conversationId: "unused" }),
    ).rejects.toThrow("503");
    await allowance.retryWarnings();
    await allowance.retryWarnings();
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toBe("https://api.resend.com/emails");
    expect(requests[0]!.headers.get("Idempotency-Key")).toBe(
      `bot-reply-warning/${scope.tenantId}/2026-10-01`,
    );
    expect(requests[1]!.headers.get("Idempotency-Key")).toBe(
      requests[0]!.headers.get("Idempotency-Key"),
    );
    expect(await requests[1]!.text()).toBe(await requests[0]!.text());
  } finally {
    network.mockRestore();
  }
});
