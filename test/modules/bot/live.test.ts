import { afterEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import {
  createBotActivation,
  createBotSandbox,
  createBotSettingsEditor,
  createLiveBot,
  type BotJob,
  type BotAllowance,
} from "@/modules/bot";
import { eq } from "drizzle-orm";
import { conversation, message } from "@/db/schema";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { createConversationRepository, recordInboundTextMessage } from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestUsageMeter, testBehaviour } from "@/test/support/bot";
import { createTestModel } from "@/test/support/model";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import {
  metaAppSecret,
  metaDelivery,
  signMetaDelivery,
  textMessageChange,
} from "@/test/support/meta-webhook";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const setup = async (allowance: BotAllowance = { canReply: async () => true }) => {
  db = await createTestDatabase();
  const seeded = await seedLiveBot(db);
  const { scope, route, clock } = seeded;
  const model = createTestModel();
  const sender = createTestWhatsAppSender();
  const queue = createTestJobQueue<BotJob>();
  const activation = createBotActivation({ db, clock });
  await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  model.script({ text: "O corte custa R$ 80." });
  await createBotSandbox({ db, clock, model }).respond(scope, { text: "Preço?", history: [] });
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: "5511999990001",
    profileName: "Ana",
    text: "Quanto custa?",
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
    allowance,
  };
  const worker = createLiveBot(dependencies);
  return {
    ...seeded,
    model,
    sender,
    queue,
    activation,
    conversationId,
    worker,
    dependencies,
    repository: createConversationRepository(db, scope),
  };
};

test("a live Contact message sends exactly once after activation, including duplicate jobs", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup();
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  await worker.run(conversationId);
  await worker.run(conversationId);
  expect(sender.sent.map(({ text }) => text)).toEqual(["O corte custa R$ 80."]);
  expect((await repository.listMessages(conversationId))!.messages).toContainEqual(
    expect.objectContaining({ origin: "bot", status: "sent", wamid: "wamid.OUT1" }),
  );
});

test("one turn includes every unanswered Contact message in a large burst", async () => {
  const { scope, route, clock, model, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  for (let index = 0; index < 55; index++) {
    await recordInboundTextMessage(db, route, {
      wamid: `burst-${index}`,
      from: "5511999990001",
      profileName: null,
      text: `Pergunta ${index}.`,
      sentAt: clock.now(),
    });
  }
  model.script({ text: "Respostas às perguntas." });
  await worker.run(conversationId);
  const input = model.requests
    .at(-1)!
    .messages.map((entry) => ("text" in entry ? entry.text : ""))
    .join("\n");
  expect(input).toContain("Quanto custa?");
  for (let index = 0; index < 55; index++) expect(input).toContain(`Pergunta ${index}.`);
});

test("an unavailable Model outside Schedule skips without Handoff", async () => {
  const { scope, clock, activation, conversationId, repository, dependencies } = await setup();
  await activation.activate(scope);
  await createBotSettingsEditor({ db, clock }).saveSettings(scope, {
    ...testBehaviour,
    schedule: "outside_business_hours",
  });
  await createLiveBot({ ...dependencies, model: null }).run(conversationId);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
});

test("a pause during generation takes precedence over an unavailable sender", async () => {
  const { scope, model, activation, conversationId, repository, dependencies } = await setup();
  await activation.activate(scope);
  const generate = model.generate;
  model.generate = async (request) => {
    await activation.setPaused(scope, true);
    return generate(request);
  };
  model.script({ text: "Resposta." });
  await createLiveBot({
    ...dependencies,
    getSender: () => {
      throw new Error("unconfigured");
    },
  }).run(conversationId);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
});

test("a Model Handoff is durable before the Meta call starts", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  model.script({
    toolCalls: [{ id: "handoff", name: "handoff", input: { reason: "pedido_do_contato" } }],
  });
  let ownership: unknown;
  sender.beforeAnswering(async () => {
    ownership = await repository.getConversation(conversationId);
  });
  await worker.run(conversationId);
  expect(ownership).toMatchObject({ owner: "team", handoffReason: "pedido_do_contato" });
});

test("an uncertain Meta send fails and hands off without resending on retry", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  sender.beforeAnswering(async () => {
    throw new Error("connection lost after Meta accepted");
  });
  await worker.run(conversationId);
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(1);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_indisponivel",
  });
  expect((await repository.listMessages(conversationId))!.messages).toContainEqual(
    expect.objectContaining({ origin: "bot", status: "failed", wamid: null }),
  );
});

test("pause and Schedule changes during generation prevent sending without Handoff", async () => {
  const fixture = await setup();
  const { scope, clock, model, sender, activation, conversationId, worker, repository } = fixture;
  await activation.activate(scope);
  const generate = model.generate;
  model.generate = async (request) => {
    await activation.setPaused(scope, true);
    return generate(request);
  };
  model.script({ text: "O corte custa R$ 80." });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
  await activation.setPaused(scope, false);
  model.generate = async (request) => {
    await createBotSettingsEditor({ db, clock }).saveSettings(scope, {
      ...testBehaviour,
      schedule: "outside_business_hours",
    });
    return generate(request);
  };
  model.script({ text: "O corte custa R$ 80." });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
});

test("a retry finding a pending reply without wamid never calls Meta", async () => {
  const { scope, clock, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  const contactMessage = (await repository.listMessages(conversationId))!.messages[0];
  await db.insert(message).values({
    tenantId: scope.tenantId,
    conversationId,
    origin: "bot",
    direction: "outbound",
    type: "text",
    text: "Resposta incerta",
    status: "pending",
    answeredMessageId: contactMessage.id,
    sentAt: clock.now(),
  });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_indisponivel",
  });
});

test("cleanup fails stuck sends and clears expired leases", async () => {
  const { scope, clock, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  await db
    .update(conversation)
    .set({ botLeaseToken: "stale", botLeaseUntil: clock.now() })
    .where(eq(conversation.id, conversationId));
  await db.insert(message).values({
    tenantId: scope.tenantId,
    conversationId,
    origin: "bot",
    direction: "outbound",
    type: "text",
    text: "Incerta",
    status: "pending",
    answeredMessageId: "key",
    sentAt: clock.now(),
    createdAt: new Date(clock.now().getTime() - 180_000),
  });
  await worker.cleanup();
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_indisponivel",
  });
  const [stored] = await db.select().from(conversation).where(eq(conversation.id, conversationId));
  expect(stored.botLeaseToken).toBeNull();
  expect((await repository.listMessages(conversationId))!.messages.at(-1)).toMatchObject({
    status: "failed",
  });
});

test("Handoff and service-window expiry during generation each block the send", async () => {
  const { scope, clock, model, sender, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  const generate = model.generate;
  model.generate = async (request) => {
    await db
      .update(conversation)
      .set({ owner: "team", handoffReason: "pedido_do_contato" })
      .where(eq(conversation.id, conversationId));
    return generate(request);
  };
  model.script({ text: "Resposta." });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  await db
    .update(conversation)
    .set({ owner: "bot", handoffReason: null })
    .where(eq(conversation.id, conversationId));
  model.generate = async (request) => {
    clock.advance(86_400_000);
    return generate(request);
  };
  model.script({ text: "Resposta." });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
});

test("allowance is rechecked after generation before a live reply is reserved", async () => {
  let allowed = true;
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup({
    canReply: async () => allowed,
  });
  await activation.activate(scope);
  model.script(() => {
    allowed = false;
    return { text: "Resposta." };
  });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "limite_atingido",
  });
});

test("cleanup preserves a live lease and its pending send", async () => {
  const { scope, clock, conversationId, worker, repository } = await setup();
  await db
    .update(conversation)
    .set({ botLeaseToken: "healthy", botLeaseUntil: new Date(clock.now().getTime() + 60_000) })
    .where(eq(conversation.id, conversationId));
  await db.insert(message).values({
    tenantId: scope.tenantId,
    conversationId,
    origin: "bot",
    direction: "outbound",
    type: "text",
    text: "Resposta.",
    status: "pending",
    sentAt: clock.now(),
    createdAt: new Date(clock.now().getTime() - 180_000),
  });
  await worker.cleanup();
  expect((await repository.listMessages(conversationId))!.messages.at(-1)).toMatchObject({
    status: "pending",
  });
  expect(await worker.run(conversationId)).toBe("busy");
});

test("a later Contact message gets a follow-up turn with prior Conversation context", async () => {
  const { scope, route, clock, model, sender, queue, activation, conversationId, worker } =
    await setup();
  await activation.activate(scope);
  const generate = model.generate;
  let injected = false;
  model.generate = async (request) => {
    if (!injected) {
      injected = true;
      clock.advance(1);
      await recordInboundTextMessage(db, route, {
        wamid: "later",
        from: "5511999990001",
        profileName: null,
        text: "E a barba?",
        sentAt: clock.now(),
      });
    }
    return generate(request);
  };
  model.script({ text: "O corte custa R$ 80." }, { text: "Vou chamar a equipe." });
  await worker.run(conversationId);
  expect(queue.take()).toEqual([{ type: "run-bot-turn", conversationId }]);
  expect(model.requests.at(-1)!.messages).not.toContainEqual(
    expect.objectContaining({ text: "E a barba?" }),
  );
  await worker.run(conversationId);
  expect(model.requests.at(-1)!.messages).toContainEqual(
    expect.objectContaining({ text: "Quanto custa?" }),
  );
  expect(sender.sent).toHaveLength(2);
});

test("inbox processing enqueues a live turn only for an eligible Contact message", async () => {
  const { scope, phoneNumberId, clock, activation, queue, worker } = await setup();
  await activation.activate(scope);
  const jobs = createTestJobQueue();
  const inbox = createWebhookInbox({
    db,
    clock,
    queue: jobs,
    notifier: createTestNotifier(),
    appSecret: metaAppSecret,
    bot: worker,
  });
  const body = metaDelivery(
    textMessageChange({
      phoneNumberId,
      wamid: "live-inbound",
      timestamp: String(clock.now().getTime() / 1000),
    }),
  );
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  for (const job of jobs.take()) await inbox.process(job.inboxEventId);
  expect(queue.take()).toEqual([{ type: "run-bot-turn", conversationId: expect.any(String) }]);
});
