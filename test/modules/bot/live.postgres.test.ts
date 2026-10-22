import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { conversation } from "@/db/schema";
import {
  createBotActivation,
  createBotSandbox,
  createBotSettingsEditor,
  createLiveBot,
  type BotJob,
} from "@/modules/bot";
import {
  createConversationBotRepository,
  createConversationRepository,
  recordInboundTextMessage,
} from "@/modules/conversations";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { createPostgresTestDatabase } from "@/test/support/postgres";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestModel } from "@/test/support/model";
import { createTestUsageMeter, testBehaviour } from "@/test/support/bot";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";

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
    await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
    await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
      kind: "faq",
      title: "Preço?",
      body: "R$ 80",
    });
    model.script({ text: "O corte custa R$ 80." });
    await createBotSandbox({ db, clock, model }).respond(scope, { text: "Preço?", history: [] });
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
      meter: createTestUsageMeter(),
      allowance: { canReply: async () => true },
    };
    return {
      db,
      scope,
      clock,
      model,
      sender,
      queue,
      conversationId,
      dependencies,
      reader: createConversationRepository(db, scope),
    };
  };

  test("competing workers cannot both send for one answered-message key", async () => {
    const { model, sender, dependencies, conversationId, reader } = await setup();
    model.script({ text: "O corte custa R$ 80." });
    await Promise.all(
      Array.from({ length: 12 }, () => createLiveBot(dependencies).run(conversationId)),
    );
    expect(sender.sent).toHaveLength(1);
    expect(
      (await reader.listMessages(conversationId))!.messages.filter(
        ({ origin }) => origin === "bot",
      ),
    ).toHaveLength(1);
  });

  test("a ChannelRoute cannot claim or mutate another Tenant's Conversation", async () => {
    const { db, clock, conversationId, reader } = await setup();
    const other = await seedLiveBot(db);
    const foreign = createConversationBotRepository(db, other.route);
    expect(await foreign.load(conversationId)).toBeNull();
    expect(await foreign.claim(conversationId, "foreign", clock.now())).toBe(false);
    expect(await foreign.listUnanswered(conversationId)).toEqual([]);
    expect(
      await foreign.reserve(conversationId, "foreign", ["foreign-key"], "Resposta", clock.now()),
    ).toBeNull();
    await foreign.handoff(conversationId, "foreign", "bot_indisponivel");
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
