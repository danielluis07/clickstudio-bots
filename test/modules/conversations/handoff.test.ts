import { afterEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { eq } from "drizzle-orm";
import { conversation, member, user } from "@/db/schema";
import { resolveTenantScope } from "@/modules/tenancy";
import {
  createBotActivation,
  createBotSandbox,
  createBotSettingsEditor,
  createLiveBot,
  type BotJob,
} from "@/modules/bot";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import {
  createConversationRepository,
  createHandoffControls,
  handOffAndNotify,
  createReplyService,
  recordInboundTextMessage,
} from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestBotAllowance, testBehaviour } from "@/test/support/bot";
import { createTestModel, type TestModel } from "@/test/support/model";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import {
  historyChange,
  messageEchoChange,
  metaAppSecret,
  referencingChange,
  metaDelivery,
  signMetaDelivery,
} from "@/test/support/meta-webhook";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const contactPhone = "5511999990001";

// Runs the action while the next Model call is in flight.
const duringGeneration = (model: TestModel, action: () => Promise<unknown>) => {
  const generate = model.generate;
  model.generate = async (request) => {
    model.generate = generate;
    await action();
    return generate(request);
  };
};

const addAttendant = async (tenantId: string) => {
  const userId = `attendant-${crypto.randomUUID()}`;
  await db.insert(user).values({ id: userId, name: "Ari", email: `${userId}@example.com` });
  await db.insert(member).values({ organizationId: tenantId, userId, role: "member" });
  return (await resolveTenantScope(db, { userId, activeTenantId: tenantId }))!;
};

// An activated Bot and one Bot-owned Conversation with an unanswered message.
const setup = async () => {
  db = await createTestDatabase();
  const seeded = await seedLiveBot(db);
  const { scope, route, clock } = seeded;
  const model = createTestModel();
  const sender = createTestWhatsAppSender();
  const queue = createTestJobQueue<BotJob>();
  const notifier = createTestNotifier();
  const activation = createBotActivation({ db, clock });
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
  await activation.activate(scope);
  const receive = async (text: string, from = contactPhone) => {
    clock.advance(1000);
    return (await recordInboundTextMessage(db, route, {
      wamid: crypto.randomUUID(),
      from,
      profileName: "Ana",
      text,
      sentAt: clock.now(),
    }))!;
  };
  const conversationId = await receive("Quanto custa?");
  const worker = createLiveBot({
    db,
    clock,
    model,
    queue,
    notifier,
    getSender: () => sender,
    allowance: createTestBotAllowance(),
  });
  const repository = createConversationRepository(db, scope);
  const jobs = createTestJobQueue();
  const inbox = createWebhookInbox({
    db,
    clock,
    queue: jobs,
    notifier,
    appSecret: metaAppSecret,
    bot: worker,
  });
  // Delivers signed Meta changes and processes them as the inbox job would.
  const deliver = async (...changes: { field: string; value: unknown }[]) => {
    const body = metaDelivery(...changes);
    await inbox.receive({ body, signature: signMetaDelivery(body) });
    for (const job of jobs.take()) await inbox.process(job.inboxEventId);
  };
  const timestamp = () => String(Math.floor(clock.now().getTime() / 1000));
  return {
    ...seeded,
    model,
    sender,
    queue,
    notifier,
    conversationId,
    receive,
    deliver,
    timestamp,
    worker,
    repository,
    controls: createHandoffControls({ db, notifier }),
    replies: createReplyService({ db, clock, notifier, getSender: () => sender }),
    ownership: async () => {
      const found = await repository.getConversation(conversationId);
      return { owner: found?.owner, handoffReason: found?.handoffReason, waiting: found?.waiting };
    },
  };
};

test("Assumir silences the Bot without sending anything to the Contact", async () => {
  const { scope, sender, conversationId, worker, controls, ownership } = await setup();

  expect(await controls.takeOver(scope, conversationId)).toEqual({ ok: true });
  await worker.run(conversationId);

  expect(sender.sent).toEqual([]);
  expect(await ownership()).toEqual({ owner: "team", handoffReason: "assumida", waiting: true });
});

test("a dashboard reply silences the Bot, even when its send fails", async () => {
  const { scope, sender, conversationId, receive, worker, replies, ownership } = await setup();
  sender.failNext();

  expect(await replies.sendReply(scope, { conversationId, text: "Já vejo para você" })).toEqual({
    ok: false,
    error: "send_failed",
  });
  await receive("Oi?");
  await worker.run(conversationId);

  expect(sender.sent).toEqual([]);
  expect(await ownership()).toEqual({
    owner: "team",
    handoffReason: "resposta_no_painel",
    waiting: true,
  });
});

test("a reply from the WhatsApp Business app, seen through its echo, silences the Bot", async () => {
  const { phoneNumberId, sender, conversationId, deliver, timestamp, worker, ownership } =
    await setup();

  await deliver(
    messageEchoChange({
      phoneNumberId,
      wamid: "wamid.APP1",
      to: contactPhone,
      timestamp: timestamp(),
    }),
  );
  await worker.run(conversationId);

  expect(sender.sent).toEqual([]);
  expect(await ownership()).toEqual({
    owner: "team",
    handoffReason: "resposta_no_app",
    waiting: true,
  });
});

test("the Bot's own echoes, app edits and imported history cause no Handoff", async () => {
  const fixture = await setup();
  const { phoneNumberId, model, sender, conversationId, receive, deliver, timestamp } = fixture;
  const { worker, ownership } = fixture;
  model.script({ text: "O corte custa R$ 80." });
  // The echo of the Bot's reply arrives before Meta answers the send.
  sender.beforeAnswering((wamid) =>
    deliver(messageEchoChange({ phoneNumberId, wamid, to: contactPhone, timestamp: timestamp() })),
  );
  await worker.run(conversationId);
  sender.beforeAnswering(async () => {});
  // And once more after the wamid is stored.
  await deliver(
    messageEchoChange({
      phoneNumberId,
      wamid: "wamid.OUT1",
      to: contactPhone,
      timestamp: timestamp(),
    }),
  );
  await deliver(
    referencingChange({
      phoneNumberId,
      wamid: "wamid.EDIT1",
      originalWamid: "wamid.OUT1",
      type: "edit",
      by: "app",
      timestamp: timestamp(),
    }),
    historyChange({
      phoneNumberId,
      threads: [
        {
          id: contactPhone,
          messages: [{ wamid: "wamid.OLD1", from: "5511999990000", timestamp: "1792400000" }],
        },
      ],
    }),
  );
  expect(await ownership()).toEqual({ owner: "bot", handoffReason: null, waiting: false });

  await receive("E a barba?");
  model.script({ text: "A barba custa R$ 40." });
  await worker.run(conversationId);
  expect(sender.sent.map(({ text }) => text)).toEqual([
    "O corte custa R$ 80.",
    "A barba custa R$ 40.",
  ]);
});

test("an app reply arriving while the Bot's reply awaits Meta hands off once the send settles", async () => {
  const fixture = await setup();
  const { phoneNumberId, model, sender, conversationId, receive, deliver, timestamp } = fixture;
  const { worker, ownership } = fixture;
  model.script({ text: "O corte custa R$ 80." });
  sender.beforeAnswering(() =>
    deliver(
      messageEchoChange({
        phoneNumberId,
        wamid: "wamid.APP1",
        to: contactPhone,
        timestamp: timestamp(),
      }),
    ),
  );
  await worker.run(conversationId);

  expect(await ownership()).toEqual({
    owner: "team",
    handoffReason: "resposta_no_app",
    waiting: true,
  });
  await receive("Obrigada!");
  model.script({ text: "Por nada." });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(1);
});

test("any Member can return the Bot, which answers only the next Contact message", async () => {
  const { scope, model, sender, conversationId, receive, worker, controls, ownership } =
    await setup();
  const attendant = await addAttendant(scope.tenantId);
  await controls.takeOver(scope, conversationId);
  await receive("Alguém aí?");
  await worker.run(conversationId);

  expect(await controls.returnToBot(attendant, conversationId)).toEqual({ ok: true });
  // "Devolver ao Bot" keeps the Conversation on the waiting list.
  expect(await ownership()).toEqual({ owner: "bot", handoffReason: "assumida", waiting: true });
  await worker.run(conversationId);
  expect(sender.sent).toEqual([]);

  await receive("Vocês abrem sábado?");
  model.script({ text: "Abrimos sim." });
  await worker.run(conversationId);
  expect(sender.sent.map(({ text }) => text)).toEqual(["Abrimos sim."]);
  const contactTexts = model.requests
    .at(-1)!
    .messages.filter((entry) => entry.role === "user")
    .map((entry) => ("text" in entry ? entry.text : ""));
  expect(contactTexts.at(-1)).toBe("Vocês abrem sábado?");
});

test("a Member bulk returns selected Handoffs without backlog replies, answering only new messages", async () => {
  const { scope, model, sender, conversationId, receive, worker, controls, repository, notifier } =
    await setup();
  const secondPhone = "5511999990002";
  const secondId = await receive("Olá", secondPhone);
  const unselectedId = await receive("Oi", "5511999990003");
  for (const id of [conversationId, secondId, unselectedId]) await controls.takeOver(scope, id);
  await receive("Alguém aí?");
  await receive("Estou aguardando", secondPhone);
  const attendant = await addAttendant(scope.tenantId);
  notifier.pings.length = 0;

  expect(await controls.bulkReturnToBot(attendant, [conversationId, secondId])).toEqual({
    ok: true,
  });
  for (const id of [conversationId, secondId]) {
    expect(await repository.getConversation(id)).toMatchObject({
      owner: "bot",
      handoffReason: "assumida",
      waiting: true,
    });
    expect(await worker.run(id)).toBe("skipped");
  }
  expect(sender.sent).toEqual([]);
  expect(await repository.getConversation(unselectedId)).toMatchObject({ owner: "team" });
  expect(notifier.pings.map(({ ping }) => ping)).toEqual(
    expect.arrayContaining([{ conversationId }, { conversationId: secondId }]),
  );

  await receive("Vocês abrem sábado?");
  model.script({ text: "Abrimos sim." });
  await worker.run(conversationId);
  await receive("E domingo?", secondPhone);
  model.script({ text: "Domingo fechamos." });
  await worker.run(secondId);
  expect(sender.sent.map(({ to, text }) => ({ to, text }))).toEqual([
    { to: contactPhone, text: "Abrimos sim." },
    { to: secondPhone, text: "Domingo fechamos." },
  ]);
});

test("bulk return refuses a mixed-Tenant or missing selection without changing any Conversation", async () => {
  const { scope, clock, conversationId, controls, repository, notifier } = await setup();
  const other = await seedLiveBot(db);
  const foreignId = (await recordInboundTextMessage(db, other.route, {
    wamid: "wamid.FOREIGN",
    from: contactPhone,
    profileName: "Ana",
    text: "Oi",
    sentAt: clock.now(),
  }))!;
  const foreignRepository = createConversationRepository(db, other.scope);
  await controls.takeOver(scope, conversationId);
  await controls.takeOver(other.scope, foreignId);
  notifier.pings.length = 0;

  for (const unavailable of [foreignId, crypto.randomUUID()]) {
    expect(await controls.bulkReturnToBot(scope, [conversationId, unavailable])).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await repository.getConversation(conversationId)).toMatchObject({ owner: "team" });
    expect(await foreignRepository.getConversation(foreignId)).toMatchObject({ owner: "team" });
  }
  expect(notifier.pings).toEqual([]);
});

test("bulk return tolerates duplicate and already-returned selections without settling a live Bot turn", async () => {
  const { scope, model, sender, conversationId, receive, worker, controls, repository } =
    await setup();
  const secondId = await receive("Oi", "5511999990002");
  await controls.takeOver(scope, secondId);

  expect(await controls.bulkReturnToBot(scope, [conversationId, secondId, secondId])).toEqual({
    ok: true,
  });
  expect(await repository.getConversation(secondId)).toMatchObject({ owner: "bot", waiting: true });
  model.script({ text: "O corte custa R$ 80." });
  await worker.run(conversationId);
  await worker.run(secondId);
  expect(sender.sent.map(({ text }) => text)).toEqual(["O corte custa R$ 80."]);
});

test("Resolvida returns the Bot and clears the waiting item", async () => {
  const { scope, model, sender, conversationId, receive, worker, controls, ownership } =
    await setup();
  await controls.takeOver(scope, conversationId);
  await receive("Alguém aí?");

  expect(await controls.resolve(scope, conversationId)).toEqual({ ok: true });
  expect(await ownership()).toEqual({ owner: "bot", handoffReason: null, waiting: false });
  await worker.run(conversationId);
  expect(sender.sent).toEqual([]);
  await receive("Vocês abrem sábado?");
  model.script({ text: "Abrimos sim." });
  await worker.run(conversationId);
  expect(sender.sent.map(({ text }) => text)).toEqual(["Abrimos sim."]);
});

test("Handoff controls refuse another Tenant's Conversation", async () => {
  const { conversationId, controls, ownership } = await setup();
  const other = await seedLiveBot(db);
  for (const command of [controls.takeOver, controls.returnToBot, controls.resolve])
    expect(await command(other.scope, conversationId)).toEqual({ ok: false, error: "not_found" });
  expect(await ownership()).toEqual({ owner: "bot", handoffReason: null, waiting: false });
});

test("a Handoff arriving between turn start and send prevents the send", async () => {
  const fixture = await setup();
  const { scope, phoneNumberId, model, sender, conversationId, deliver, timestamp } = fixture;
  const { worker, controls, replies } = fixture;
  const handoffs = [
    () => controls.takeOver(scope, conversationId),
    () => replies.sendReply(scope, { conversationId, text: "Deixa comigo" }),
    () =>
      deliver(
        messageEchoChange({
          phoneNumberId,
          wamid: "wamid.APP1",
          to: contactPhone,
          timestamp: timestamp(),
        }),
      ),
  ];
  for (const handoff of handoffs) {
    duringGeneration(model, handoff);
    model.script({ text: "O corte custa R$ 80." });
    await worker.run(conversationId);
    expect(sender.sent.filter(({ text }) => text === "O corte custa R$ 80.")).toEqual([]);
    await controls.returnToBot(scope, conversationId);
    await fixture.receive("Quanto custa?");
  }
});

test("a Handoff and resume during generation never answer the Handoff backlog", async () => {
  const { scope, model, sender, conversationId, worker, controls, ownership } = await setup();
  duringGeneration(model, async () => {
    await controls.takeOver(scope, conversationId);
    await controls.resolve(scope, conversationId);
  });
  model.script({ text: "O corte custa R$ 80." });

  await worker.run(conversationId);

  expect(sender.sent).toEqual([]);
  expect(await ownership()).toEqual({ owner: "bot", handoffReason: null, waiting: false });
});

test("a Bot-initiated Handoff tells the Contact and joins the waiting list", async () => {
  const { model, sender, conversationId, worker, ownership } = await setup();
  model.script({
    toolCalls: [{ id: "handoff", name: "handoff", input: { reason: "pedido_do_contato" } }],
  });

  await worker.run(conversationId);

  expect(sender.sent.map(({ text }) => text)).toEqual([
    "Certo, vou chamar alguém da equipe para continuar o atendimento.",
  ]);
  expect(await ownership()).toEqual({
    owner: "team",
    handoffReason: "pedido_do_contato",
    waiting: true,
  });
});

test("the waiting filter lists Conversations until they are resolved", async () => {
  const { scope, route, clock, conversationId, controls, repository } = await setup();
  await recordInboundTextMessage(db, route, {
    wamid: "wamid.OTHER",
    from: "5511999990002",
    profileName: "Bia",
    text: "Oi",
    sentAt: clock.now(),
  });
  const waitingIds = async () =>
    (await repository.listConversations({ waiting: true })).conversations.map(({ id }) => id);

  expect(await waitingIds()).toEqual([]);
  await controls.takeOver(scope, conversationId);
  expect(await waitingIds()).toEqual([conversationId]);
  await controls.returnToBot(scope, conversationId);
  expect(await waitingIds()).toEqual([conversationId]);
  await controls.resolve(scope, conversationId);
  expect(await waitingIds()).toEqual([]);
  expect((await repository.listConversations()).conversations).toHaveLength(2);
});

test("a failed Bot send after Assumir keeps the Member's Handoff reason", async () => {
  const { scope, model, sender, conversationId, worker, controls, ownership } = await setup();
  model.script({ text: "O corte custa R$ 80." });
  sender.beforeAnswering(async () => {
    await controls.takeOver(scope, conversationId);
    throw new Error("connection lost after Meta accepted");
  });

  await worker.run(conversationId);

  expect(await ownership()).toEqual({ owner: "team", handoffReason: "assumida", waiting: true });
});

test("a live turn's Handoff needs its lease, and only a change of hands notifies the inbox", async () => {
  const { route, conversationId, notifier, ownership } = await setup();
  await db
    .update(conversation)
    .set({ botLeaseToken: "holder" })
    .where(eq(conversation.id, conversationId));
  const pings = notifier.pings.length;
  const handOff = (leaseToken: string, reason: "limite_atingido" | "bot_indisponivel") =>
    handOffAndNotify(db, notifier, route, conversationId, reason, { leaseToken });

  expect(await handOff("expired-holder", "limite_atingido")).toBe(false);
  expect(await ownership()).toEqual({ owner: "bot", handoffReason: null, waiting: false });
  expect(await handOff("holder", "limite_atingido")).toBe(true);
  expect(await handOff("holder", "bot_indisponivel")).toBe(false);

  expect(await ownership()).toEqual({
    owner: "team",
    handoffReason: "limite_atingido",
    waiting: true,
  });
  expect(notifier.pings.slice(pings)).toEqual([
    { tenantId: route.tenantId, ping: { conversationId } },
  ]);
});
