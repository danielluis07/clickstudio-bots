import { afterEach, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { botTurnRecord, organization } from "@/db/schema";
import {
  alertBotHandoffSpikes,
  createBotActivation,
  createBotAllowance,
  createBotSandbox,
  createBotSettingsEditor,
  createLiveBot,
  pruneBotTurnRecords,
  type BotJob,
} from "@/modules/bot";
import { recordInboundTextMessage } from "@/modules/conversations";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import type { Diagnostic } from "@/platform/diagnostics";
import { testBehaviour } from "@/test/support/bot";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestMailer } from "@/test/support/mailer";
import { createTestModel } from "@/test/support/model";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const contactPhone = "5511999990001";
const contactName = "Ana Souza";
const contactText = "Quanto custa o corte? Meu CPF é 123.456.789-00";

// An activated Bot with one unanswered Contact message. The Model takes 1.5 s.
const setup = async ({ sender = true } = {}) => {
  db = await createTestDatabase();
  const seeded = await seedLiveBot(db);
  const { scope, route, clock } = seeded;
  const model = createTestModel();
  const activation = createBotActivation({ db, clock });
  await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  model.script({ text: "O corte custa R$ 80." });
  await createBotSandbox({ activation, db, clock, model }).respond(scope, {
    text: "Preço?",
    history: [],
  });
  await activation.activate(scope);
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: contactPhone,
    profileName: contactName,
    text: contactText,
    sentAt: clock.now(),
  }))!;
  const whatsapp = createTestWhatsAppSender();
  const worker = createLiveBot({
    db,
    clock,
    model: {
      async generate(request) {
        clock.advance(1500);
        return model.generate(request);
      },
    },
    queue: createTestJobQueue<BotJob>(),
    notifier: createTestNotifier(),
    getSender: () => {
      if (!sender) throw new Error("WhatsApp is not configured");
      return whatsapp;
    },
    allowance: createBotAllowance({ db, clock, mailer: createTestMailer() }),
  });
  return { ...seeded, model, worker, conversationId, whatsapp };
};

const records = () => db.select().from(botTurnRecord).orderBy(botTurnRecord.at);

test("a sent reply records its outcome, tokens and duration under its Tenant", async () => {
  const { route, model, worker, conversationId, clock } = await setup();
  model.script({
    text: "O corte custa R$ 80.",
    usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 900, cacheWriteTokens: 40 },
  });

  expect(await worker.run(conversationId)).toBe("sent");

  expect(await records()).toEqual([
    {
      id: expect.any(String),
      tenantId: route.tenantId,
      at: clock.now(),
      outcome: "sent",
      handoffReason: null,
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 900,
      cacheWriteTokens: 40,
      toolRoundTrips: 0,
      durationMs: 1500,
    },
  ]);
});

test("a Handoff records its reason and the tokens spent before it", async () => {
  const { model, worker, conversationId } = await setup();
  model.script({
    toolCalls: [{ id: "call-1", name: "handoff", input: { reason: "pedido_do_contato" } }],
    usage: { inputTokens: 50, outputTokens: 5 },
  });

  await worker.run(conversationId);

  expect(await records()).toMatchObject([
    { outcome: "handoff", handoffReason: "pedido_do_contato", inputTokens: 50, outputTokens: 5 },
  ]);
});

test("a gate Handoff after the Model call keeps the turn's tokens", async () => {
  const { model, worker, conversationId } = await setup({ sender: false });
  model.script({ text: "O corte custa R$ 80.", usage: { inputTokens: 70, outputTokens: 9 } });

  expect(await worker.run(conversationId)).toBe("handoff");

  expect(await records()).toMatchObject([
    { outcome: "handoff", handoffReason: "bot_indisponivel", inputTokens: 70, outputTokens: 9 },
  ]);
});

test("a skipped turn is recorded with no tokens", async () => {
  const { worker, conversationId, clock } = await setup();
  // The 24-hour service window has closed.
  clock.advance(25 * 60 * 60_000);

  expect(await worker.run(conversationId)).toBe("skipped");

  expect(await records()).toMatchObject([
    { outcome: "skipped", handoffReason: null, inputTokens: 0, outputTokens: 0, durationMs: 0 },
  ]);
});

test("no stored record carries message text, a name or a phone number", async () => {
  const { model, worker, conversationId } = await setup();
  model.script({ text: "O corte custa R$ 80, Ana." });

  await worker.run(conversationId);

  const stored = JSON.stringify(await queryTestDatabase(db, "select * from bot_turn_record"));
  for (const forbidden of [contactPhone, contactName, "Ana", "CPF", "123.456", "R$ 80"])
    expect(stored).not.toContain(forbidden);
});

test("a failed record write does not fail a turn whose reply was sent", async () => {
  const { model, worker, conversationId, whatsapp } = await setup();
  await db.execute(
    sql`alter table bot_turn_record add constraint reject_records check (duration_ms < 0)`,
  );
  model.script({ text: "O corte custa R$ 80." });

  expect(await worker.run(conversationId)).toBe("sent");
  expect(whatsapp.sent).toHaveLength(1);
  expect(await records()).toEqual([]);
});

const insertRecords = async (
  tenantId: string,
  at: Date,
  rows: { outcome: "sent" | "skipped" | "handoff"; handoffReason?: "bot_indisponivel" }[],
) =>
  db.insert(botTurnRecord).values(
    rows.map((row, index) => ({
      tenantId,
      at: new Date(at.getTime() + index),
      outcome: row.outcome,
      handoffReason: row.handoffReason ?? null,
      inputTokens: 1_000,
      outputTokens: 100,
      cacheReadTokens: 10,
      cacheWriteTokens: 1,
      toolRoundTrips: 0,
      durationMs: 1_000,
    })),
  );

const repeat = <T>(count: number, row: T) => Array.from({ length: count }, () => row);

test("token cost per Tenant per month is one query", async () => {
  const { route } = await setup();
  await insertRecords(
    route.tenantId,
    new Date("2026-09-30T23:00:00Z"),
    repeat(2, { outcome: "sent" }),
  );
  await insertRecords(
    route.tenantId,
    new Date("2026-10-01T12:00:00Z"),
    repeat(3, { outcome: "sent" }),
  );

  // As in docs/live-bot.md: months in São Paulo time.
  const rows = await queryTestDatabase<{ month: string; input_tokens: string }>(
    db,
    `select tenant_id,
            to_char(date_trunc('month', at at time zone 'America/Sao_Paulo'), 'YYYY-MM') as month,
            sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
            sum(cache_read_tokens) as cache_read_tokens, sum(cache_write_tokens) as cache_write_tokens
       from bot_turn_record
      group by 1, 2
      order by 1, 2`,
  );

  expect(rows.map(({ month, input_tokens }) => [month, Number(input_tokens)])).toEqual([
    ["2026-09", 2_000],
    ["2026-10", 3_000],
  ]);
});

test("records are deleted with their Tenant", async () => {
  db = await createTestDatabase();
  const tenantId = crypto.randomUUID();
  await db.insert(organization).values({ id: tenantId, name: "Barbearia", slug: tenantId });
  await insertRecords(tenantId, new Date("2026-10-01T12:00:00Z"), [{ outcome: "sent" }]);

  await db.delete(organization).where(eq(organization.id, tenantId));

  expect(await records()).toEqual([]);
});

test("the daily task deletes records older than 13 months", async () => {
  db = await createTestDatabase();
  const tenantId = crypto.randomUUID();
  await db.insert(organization).values({ id: tenantId, name: "Barbearia", slug: tenantId });
  await insertRecords(tenantId, new Date("2025-10-09T23:59:00Z"), [{ outcome: "sent" }]);
  await insertRecords(tenantId, new Date("2025-10-10T00:01:00Z"), [{ outcome: "skipped" }]);
  const clock = { now: () => new Date("2026-11-10T00:00:00Z") };

  expect(await pruneBotTurnRecords(db, clock)).toBe(1);
  expect(await records()).toMatchObject([{ outcome: "skipped" }]);
});

const unavailable = { outcome: "handoff", handoffReason: "bot_indisponivel" } as const;

const spikeSetup = async () => {
  db = await createTestDatabase();
  const tenants = [crypto.randomUUID(), crypto.randomUUID()].sort();
  for (const id of tenants) await db.insert(organization).values({ id, name: "Loja", slug: id });
  const now = new Date("2026-11-10T12:00:00Z");
  const alerts: Diagnostic[] = [];
  const check = () =>
    alertBotHandoffSpikes({
      db,
      clock: { now: () => now },
      diagnostics: { alert: async (entry) => void alerts.push(entry) },
    });
  return {
    tenants,
    now,
    alerts,
    check,
    minutesAgo: (m: number) => new Date(now.getTime() - m * 60_000),
  };
};

test("a jump in a Tenant's Bot indisponível Handoffs alerts with counts only", async () => {
  const { tenants, alerts, check, minutesAgo } = await spikeSetup();
  const [spiking, steady] = tenants;
  // Last hour: 3 of 5 decided turns handed off as unavailable; skips don't count.
  await insertRecords(spiking, minutesAgo(30), [
    ...repeat(3, unavailable),
    ...repeat(2, { outcome: "sent" as const }),
    ...repeat(10, { outcome: "skipped" as const }),
  ]);
  // Usually 1 in 20.
  await insertRecords(spiking, minutesAgo(3 * 24 * 60), [
    unavailable,
    ...repeat(19, { outcome: "sent" as const }),
  ]);
  // Two unavailable Handoffs are too few to alert.
  await insertRecords(steady, minutesAgo(10), repeat(2, unavailable));

  expect(await check()).toEqual([spiking]);
  expect(alerts).toEqual([{ kind: "bot_handoff_spike", tenantId: spiking, handoffs: 3, turns: 5 }]);
});

test("a Tenant whose Handoff rate is normal for it does not alert", async () => {
  const { tenants, check, minutesAgo } = await spikeSetup();
  const [tenant] = tenants;
  // 3 in 10 in the last hour, as over the past days.
  await insertRecords(tenant, minutesAgo(30), [
    ...repeat(3, unavailable),
    ...repeat(7, { outcome: "sent" as const }),
  ]);
  await insertRecords(tenant, minutesAgo(2 * 24 * 60), [
    ...repeat(30, unavailable),
    ...repeat(70, { outcome: "sent" as const }),
  ]);
  // Older than the baseline window: ignored.
  await insertRecords(tenant, minutesAgo(8 * 24 * 60), repeat(100, { outcome: "sent" as const }));

  expect(await check()).toEqual([]);
});

test("Handoffs for other reasons, or a low rate, do not alert", async () => {
  const { tenants, check, minutesAgo } = await spikeSetup();
  const [manyTurns, otherReason] = tenants;
  await insertRecords(manyTurns, minutesAgo(20), [
    ...repeat(3, unavailable),
    ...repeat(30, { outcome: "sent" as const }),
  ]);
  await db.insert(botTurnRecord).values(
    repeat(5, null).map((_, index) => ({
      tenantId: otherReason,
      at: new Date(minutesAgo(20).getTime() + index),
      outcome: "handoff" as const,
      handoffReason: "pedido_do_contato" as const,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      toolRoundTrips: 0,
      durationMs: 0,
    })),
  );

  expect(await check()).toEqual([]);
});
