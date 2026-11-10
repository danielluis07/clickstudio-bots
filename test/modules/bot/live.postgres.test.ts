import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { botReplyUsage, conversation } from "@/db/schema";
import {
  createBotActivation,
  createBotSandbox,
  createBotSettingsEditor,
  createLiveBot,
  createBotAllowance,
  type BotJob,
} from "@/modules/bot";
import {
  createConversationRepository,
  handOffAndNotify,
  hasUnansweredContactMessages,
  readBotEligibility,
  recordInboundTextMessage,
} from "@/modules/conversations";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { createPostgresTestDatabase } from "@/test/support/postgres";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestModel } from "@/test/support/model";
import { testBehaviour } from "@/test/support/bot";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createTestMailer } from "@/test/support/mailer";

const url = process.env.BOT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;

suite("live turns on real Postgres", () => {
  beforeAll(async () => {
    database = await createPostgresTestDatabase(url!);
  });
  afterAll(async () => {
    await database?.close();
  });

  const setup = async () => {
    const db = database.db;
    const { scope, route, clock } = await seedLiveBot(db);
    const model = createTestModel();
    const sender = createTestWhatsAppSender();
    const queue = createTestJobQueue<BotJob>();
    const mailer = createTestMailer();
    const allowance = createBotAllowance({ db, clock, mailer });
    await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
    await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
      kind: "faq",
      title: "Preço?",
      body: "R$ 80",
    });
    model.script({ text: "O corte custa R$ 80." });
    await createBotSandbox({
      activation: createBotActivation({ db, clock }),
      db,
      clock,
      model,
    }).respond(scope, { text: "Preço?", history: [] });
    await createBotActivation({ db, clock }).activate(scope);
    const conversationId = (await recordInboundTextMessage(db, route, {
      wamid: crypto.randomUUID(),
      from: "5511999990001",
      profileName: "Ana",
      text: "Preço?",
      sentAt: clock.now(),
    }))!;
    const dependencies = {
      db,
      clock,
      model,
      queue,
      notifier: createTestNotifier(),
      getSender: () => sender,
      allowance,
    };
    return {
      db,
      scope,
      route,
      clock,
      model,
      sender,
      queue,
      conversationId,
      dependencies,
      allowance,
      mailer,
      reader: createConversationRepository(db, scope),
    };
  };

  test("concurrent acknowledged replies increment atomically and send one 80% warning", async () => {
    const {
      db,
      scope,
      route,
      clock,
      model,
      sender,
      dependencies,
      conversationId,
      allowance,
      mailer,
    } = await setup();
    await db
      .insert(botReplyUsage)
      .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 3999 });
    const otherConversationId = (await recordInboundTextMessage(db, route, {
      wamid: crypto.randomUUID(),
      from: "5511999990002",
      profileName: null,
      text: "Preço?",
      sentAt: clock.now(),
    }))!;
    const accepted = Promise.withResolvers<void>();
    let arrivals = 0;
    sender.beforeAnswering(async () => {
      if (++arrivals === 2) accepted.resolve();
      await accepted.promise;
    });
    model.script({ text: "R$ 80." }, { text: "R$ 80." });
    // Warning contention can ask a worker to retry after persisting its reply.
    await Promise.allSettled([
      createLiveBot(dependencies).run(conversationId),
      createLiveBot(dependencies).run(otherConversationId),
    ]);
    await createLiveBot(dependencies).run(conversationId);
    await createLiveBot(dependencies).run(otherConversationId);
    expect(await allowance.status(scope)).toMatchObject({ used: 4001, warning: true });
    expect(mailer.sent).toHaveLength(1);
    expect(sender.sent).toHaveLength(2);
  });

  test("competing workers cannot both send for one answered-message key", async () => {
    const { scope, model, sender, dependencies, conversationId, reader, allowance } = await setup();
    model.script({ text: "O corte custa R$ 80." });
    await Promise.all(
      Array.from({ length: 12 }, () => createLiveBot(dependencies).run(conversationId)),
    );
    expect(sender.sent).toHaveLength(1);
    expect(await allowance.status(scope)).toMatchObject({ used: 1 });
    expect(
      (await reader.listMessages(conversationId))!.messages.filter(
        ({ origin }) => origin === "bot",
      ),
    ).toHaveLength(1);
  });

  test("a ChannelRoute cannot read or hand off another Tenant's Conversation", async () => {
    const { db, clock, conversationId, reader } = await setup();
    const other = await seedLiveBot(db);
    expect(await readBotEligibility(db, other.route, conversationId, clock.now())).toBeNull();
    expect(await hasUnansweredContactMessages(db, other.route, conversationId)).toBe(false);
    expect(
      await handOffAndNotify(
        db,
        createTestNotifier(),
        other.route,
        conversationId,
        "bot_indisponivel",
        {
          leaseToken: "foreign",
        },
      ),
    ).toBe(false);
    expect(await reader.getConversation(conversationId)).toMatchObject({
      owner: "bot",
      handoffReason: null,
    });
  });

  test("an expired lease recovers while its former holder cannot send", async () => {
    const { clock, model, sender, dependencies, conversationId } = await setup();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const generate = model.generate;
    let first = true;
    model.generate = async (request) => {
      if (first) {
        first = false;
        entered.resolve();
        await release.promise;
      }
      return generate(request);
    };
    model.script({ text: "O corte custa R$ 80." }, { text: "O corte custa R$ 80." });
    const stale = createLiveBot(dependencies).run(conversationId);
    await entered.promise;
    clock.advance(120_001);
    try {
      await createLiveBot(dependencies).run(conversationId);
    } finally {
      release.resolve();
    }
    await stale;
    expect(sender.sent).toHaveLength(1);
  });

  test("a pending Meta call holds no database lock and an expired-lease retry never resends", async () => {
    const { clock, model, sender, dependencies, conversationId, reader } = await setup();
    model.script({ text: "O corte custa R$ 80." });
    let probeCompleted = false;
    sender.beforeAnswering(async () => {
      // A second connection must be able to change ownership while Meta waits.
      // The timeout turns an accidental transaction around the send into a failure.
      await dependencies.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '1s'`);
        await tx
          .update(conversation)
          .set({ handoffReason: "assumida" })
          .where(eq(conversation.id, conversationId));
      });
      probeCompleted = true;
      clock.advance(120_001);
      await createLiveBot(dependencies).run(conversationId);
    });
    await createLiveBot(dependencies).run(conversationId);
    expect(probeCompleted).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(await reader.getConversation(conversationId)).toMatchObject({
      owner: "team",
      handoffReason: "bot_indisponivel",
    });
  });
});
