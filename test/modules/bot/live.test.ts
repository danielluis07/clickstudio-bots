import { afterEach, expect, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBubble } from "@/components/inbox/message-bubble";
import type { Database } from "@/db/database";
import {
  createBotActivation,
  createBotSandbox,
  createBotSettingsEditor,
  createCaptureSettingsEditor,
  createLiveBot,
  createBotAllowance,
  burstWait,
  botTurnAttempts,
  dailyContactReplyLimit,
  ReservationRaceError,
  type BotJob,
  type BotAllowance,
  type BurstWait,
} from "@/modules/bot";
import { RetryableError } from "@/platform/retryable";
import { eq, sql } from "drizzle-orm";
import {
  botReplyUsage,
  botTurnRecord,
  channel,
  contact,
  conversation,
  message,
  organization,
} from "@/db/schema";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import {
  createConversationRepository,
  createHandoffControls,
  recordInboundTextMessage,
} from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import {
  createTestBotAllowance,
  createTestInboxBot,
  saveTestSettings,
  testBotSettings,
} from "@/test/support/bot";
import { createTestModel } from "@/test/support/model";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createTestMailer } from "@/test/support/mailer";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import {
  metaAppSecret,
  metaDelivery,
  signMetaDelivery,
  textMessageChange,
  mediaMessageChange,
  reactionChange,
} from "@/test/support/meta-webhook";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const setup = async (allowance?: BotAllowance, burst: BurstWait | null = null) => {
  db = await createTestDatabase();
  const seeded = await seedLiveBot(db);
  const { scope, route, clock } = seeded;
  const model = createTestModel();
  const sender = createTestWhatsAppSender();
  const queue = createTestJobQueue<BotJob>();
  const activation = createBotActivation({ db, clock });
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, testBotSettings);
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
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: "5511999990001",
    profileName: "Ana",
    text: "Quanto custa?",
    sentAt: clock.now(),
  }))!;
  const sleeps: number[] = [];
  const dependencies = {
    db,
    clock,
    model,
    queue,
    notifier: createTestNotifier(),
    getSender: () => sender,
    allowance: allowance ?? createBotAllowance({ db, clock, mailer: createTestMailer() }),
    // Every job answers at once unless a test asks for the burst wait.
    burst,
    // Waits between Meta sends are recorded, not slept.
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
  const worker = createLiveBot(dependencies);
  const inboxJobs = createTestJobQueue();
  const inboxBot = createTestInboxBot(worker);
  const inbox = createWebhookInbox({
    db,
    clock,
    queue: inboxJobs,
    notifier: dependencies.notifier,
    appSecret: metaAppSecret,
    bot: inboxBot,
  });
  return {
    ...seeded,
    model,
    sender,
    queue,
    activation,
    conversationId,
    worker,
    inboxBot,
    dependencies,
    repository: createConversationRepository(db, scope),
    async receive(
      change: Parameters<typeof metaDelivery>[number],
      status: "processed" | "ignored" = "processed",
    ) {
      const body = metaDelivery(change);
      expect(await inbox.receive({ body, signature: signMetaDelivery(body) })).toEqual({
        ok: true,
      });
      for (const job of inboxJobs.take())
        expect(await inbox.process(job.inboxEventId)).toMatchObject({ status });
    },
  };
};

test.each([
  ["a short voice note", "audio", 3, "Áudio"],
  ["a long voice note", "audio", 600, "Áudio"],
  ["an image", "image", undefined, "Imagem"],
  ["a video", "video", undefined, "Vídeo"],
  ["a document", "document", undefined, "Documento"],
  ["a sticker", "sticker", undefined, "Figurinha"],
  ["unknown media", "unknown", undefined, "Mídia não suportada"],
] as const)(
  "%s shows a placeholder and hands off without a media download",
  async (_name, type, duration, label) => {
    const { phoneNumberId, clock, conversationId, repository, receive, model, sender } =
      await setup();
    const network = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Unexpected media download"),
    );
    try {
      await receive(
        mediaMessageChange({
          phoneNumberId,
          wamid: "unsupported-media",
          from: "5511999990001",
          timestamp: String(clock.now().getTime() / 1000),
          type,
          duration,
        }),
      );
      expect(await repository.getConversation(conversationId)).toMatchObject({
        owner: "team",
        waiting: true,
        handoffReason: "no_answer",
      });
      const messages = (await repository.listMessages(conversationId))!.messages;
      const media = messages.find((row) => row.type !== "text")!;
      expect(media).toMatchObject({ type: type === "unknown" ? "unsupported" : type, text: null });
      const html = renderToStaticMarkup(createElement(MessageBubble, { message: media }));
      expect(html).toContain(label);
      expect(html).toContain("Abra no WhatsApp");
      expect(html).not.toContain("synthetic-media-id");
      expect(model.requests).toHaveLength(1); // Only the activation sandbox turn.
      expect(sender.sent).toHaveLength(0);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  },
);

test.each([
  ["a reaction", "👍"],
  ["a removed reaction", ""],
])("%s on the Bot's answer leaves the Conversation with the Bot", async (_name, emoji) => {
  const {
    phoneNumberId,
    clock,
    scope,
    activation,
    conversationId,
    repository,
    receive,
    model,
    sender,
    worker,
    queue,
  } = await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  await worker.run(conversationId);
  queue.take();
  const before = await repository.getConversation(conversationId);
  const messages = (await repository.listMessages(conversationId))!.messages;
  const answer = messages.find((row) => row.direction === "outbound")!;
  clock.advance(60 * 60 * 1000);
  await receive(
    reactionChange({
      phoneNumberId,
      wamid: "reaction-wamid",
      reactedWamid: answer.wamid!,
      from: "5511999990001",
      emoji,
      timestamp: String(clock.now().getTime() / 1000),
    }),
    "ignored",
  );
  const after = (await repository.getConversation(conversationId))!;
  expect(after).toMatchObject({ owner: "bot", waiting: false, handoffReason: null });
  // Only the Contact's live messages open or extend the service window.
  expect(after.serviceWindowClosesAt).toEqual(before!.serviceWindowClosesAt);
  expect((await repository.listMessages(conversationId))!.messages).toEqual(messages);
  expect(queue.take()).toHaveLength(0);
  expect(model.requests).toHaveLength(2); // The sandbox turn and the answer.
  expect(sender.sent).toHaveLength(1);
});

test.each(["image", "video", "document"])(
  "an answerable %s caption is answered without Handoff or a media download",
  async (type) => {
    const {
      phoneNumberId,
      clock,
      scope,
      activation,
      conversationId,
      repository,
      receive,
      model,
      sender,
      worker,
    } = await setup();
    await activation.activate(scope);
    model.script({ text: "O corte custa R$ 80." });
    await worker.run(conversationId);
    clock.advance(1000);
    const network = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Unexpected media download"),
    );
    try {
      await receive(
        mediaMessageChange({
          phoneNumberId,
          wamid: "captioned-media",
          from: "5511999990001",
          timestamp: String(clock.now().getTime() / 1000),
          type,
          caption: "Qual é o preço do corte?",
        }),
      );
      const media = (await repository.listMessages(conversationId))!.messages.find(
        (row) => row.type === type,
      )!;
      const html = renderToStaticMarkup(createElement(MessageBubble, { message: media }));
      expect(html).toContain("Abra no WhatsApp");
      expect(html).toContain("Qual é o preço do corte?");
      model.script({ text: "O corte custa R$ 80." });
      expect(await worker.run(conversationId)).toBe("sent");
      expect(await repository.getConversation(conversationId)).toMatchObject({
        owner: "bot",
        waiting: false,
      });
      expect(sender.sent.at(-1)?.text).toBe("O corte custa R$ 80.");
      expect(model.requests.at(-1)!.messages).toContainEqual(
        expect.objectContaining({
          role: "user",
          text: expect.stringContaining("Qual é o preço do corte?"),
        }),
      );
      expect(JSON.stringify(model.requests.at(-1))).not.toContain("synthetic-media");
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  },
);

test("a voice note hands off even with an answerable caption and required Contact capture", async () => {
  const {
    scope,
    phoneNumberId,
    clock,
    activation,
    conversationId,
    repository,
    receive,
    sender,
    worker,
  } = await setup();
  await activation.activate(scope);
  await createCaptureSettingsEditor({ db, clock }).saveCapture(scope, {
    enabled: true,
    fields: { name: "required", email: "off", city: "off", need: "off" },
  });
  await receive(
    mediaMessageChange({
      phoneNumberId,
      wamid: "audio-with-caption",
      from: "5511999990001",
      timestamp: String(clock.now().getTime() / 1000),
      type: "audio",
      caption: "Qual é o preço do corte?",
      duration: 600,
    }),
  );
  await worker.run(conversationId);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    waiting: true,
  });
  expect((await repository.listMessages(conversationId))!.messages).toContainEqual(
    expect.objectContaining({ type: "audio", text: null }),
  );
  expect(sender.sent).toHaveLength(0);
});

test("a caption requiring unavailable media hands off instead of inventing its contents", async () => {
  const {
    scope,
    phoneNumberId,
    clock,
    activation,
    conversationId,
    repository,
    receive,
    model,
    worker,
  } = await setup();
  await activation.activate(scope);
  await receive(
    mediaMessageChange({
      phoneNumberId,
      wamid: "unanswerable-caption",
      from: "5511999990001",
      timestamp: String(clock.now().getTime() / 1000),
      type: "image",
      caption: "O que aparece nesta foto?",
    }),
  );
  model.script({
    toolCalls: [{ id: "handoff", name: "handoff", input: { reason: "no_answer" } }],
  });
  await worker.run(conversationId);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "no_answer",
  });
});

test("a voice note arriving during generation blocks the pending Bot reply", async () => {
  const {
    scope,
    phoneNumberId,
    clock,
    activation,
    conversationId,
    repository,
    receive,
    model,
    sender,
    worker,
  } = await setup();
  await activation.activate(scope);
  const generate = model.generate;
  model.generate = async (request) => {
    clock.advance(1000);
    await receive(
      mediaMessageChange({
        phoneNumberId,
        wamid: "audio-during-generation",
        from: "5511999990001",
        timestamp: String(clock.now().getTime() / 1000),
        type: "audio",
      }),
    );
    return generate(request);
  };
  model.script({ text: "O corte custa R$ 80." });
  expect(await worker.run(conversationId)).toBe("skipped");
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "no_answer",
  });
  expect(sender.sent).toHaveLength(0);
});

test("retrying media after a failed inbox event preserves a Member's return to the Bot", async () => {
  const {
    scope,
    phoneNumberId,
    clock,
    conversationId,
    repository,
    receive,
    inboxBot,
    dependencies,
  } = await setup();
  const change = mediaMessageChange({
    phoneNumberId,
    wamid: "retried-media",
    from: "5511999990001",
    timestamp: String(clock.now().getTime() / 1000),
    type: "image",
  });
  inboxBot.failNext();
  await expect(receive(change)).rejects.toThrow("Bot queue unavailable");
  await createHandoffControls(dependencies).returnToBot(scope, conversationId);
  await receive(change);
  expect(await repository.getConversation(conversationId)).toMatchObject({ owner: "bot" });
  expect(
    (await repository.listMessages(conversationId))!.messages.filter((row) => row.type === "image"),
  ).toHaveLength(1);
});

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

test("the last allowed reply counts once; new messages hand off at the limit and remain with the team next month", async () => {
  const { scope, route, clock, model, sender, activation, conversationId, worker, repository } =
    await setup();
  await activation.activate(scope);
  const allowance = createBotAllowance({ db, clock, mailer: createTestMailer() });
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 4999 });
  model.script({ text: "Última resposta do mês." });
  await worker.run(conversationId);
  await worker.run(conversationId);
  expect(await allowance.status(scope)).toMatchObject({ used: 5000, exhausted: true });
  const requestsBeforeLimit = model.requests.length;
  await recordInboundTextMessage(db, route, {
    wamid: "at-limit",
    from: "5511999990001",
    profileName: null,
    text: "Mais uma pergunta",
    sentAt: clock.now(),
  });
  await worker.run(conversationId);
  expect(model.requests).toHaveLength(requestsBeforeLimit);
  expect(sender.sent).toHaveLength(1);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    waiting: true,
    handoffReason: "allowance_exhausted",
  });
  clock.set(new Date("2026-11-01T03:00:00Z"));
  await recordInboundTextMessage(db, route, {
    wamid: "next-month-existing",
    from: "5511999990001",
    profileName: null,
    text: "Oi",
    sentAt: clock.now(),
  });
  await worker.run(conversationId);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "allowance_exhausted",
  });
  const freshConversation = (await recordInboundTextMessage(db, route, {
    wamid: "next-month-new",
    from: "5511999990002",
    profileName: null,
    text: "Preço?",
    sentAt: clock.now(),
  }))!;
  model.script({ text: "R$ 80." });
  await worker.run(freshConversation);
  expect(await allowance.status(scope)).toMatchObject({ used: 1, exhausted: false });
  expect(sender.sent).toHaveLength(2);
});

test("a failed usage increment rolls back acknowledgment and a job retry never resends", async () => {
  const { scope, clock, model, sender, activation, conversationId, worker, repository } =
    await setup();
  await activation.activate(scope);
  await db.execute(
    sql`alter table bot_reply_usage add constraint reject_usage check (replies = 0)`,
  );
  model.script({ text: "Resposta." });
  await expect(worker.run(conversationId)).rejects.toThrow();
  expect(sender.sent).toHaveLength(1);
  expect((await repository.listMessages(conversationId))!.messages).toContainEqual(
    expect.objectContaining({ origin: "bot", status: "pending", wamid: null }),
  );
  expect(
    await createBotAllowance({ db, clock, mailer: createTestMailer() }).status(scope),
  ).toMatchObject({ used: 0 });
  await db.execute(sql`alter table bot_reply_usage drop constraint reject_usage`);
  expect(await worker.run(conversationId)).toBe("handoff");
  expect(sender.sent).toHaveLength(1);
});

test("sandbox output and an uncertain Meta send never consume production replies", async () => {
  const { scope, clock, model, sender, activation, conversationId, worker } = await setup();
  const allowance = createBotAllowance({ db, clock, mailer: createTestMailer() });
  expect(await allowance.status(scope)).toMatchObject({ used: 0 });
  await activation.activate(scope);
  model.script({ text: "Não confirmada." });
  sender.failNext();
  await worker.run(conversationId);
  await worker.run(conversationId);
  expect(await allowance.status(scope)).toMatchObject({ used: 0 });
});

test("a Contact past today's reply cap hands off without the Model while other Contacts are answered", async () => {
  const { scope, route, clock, model, sender, activation, conversationId, worker, repository } =
    await setup();
  await activation.activate(scope);
  await db.insert(message).values(
    Array.from({ length: dailyContactReplyLimit }, () => ({
      tenantId: scope.tenantId,
      conversationId,
      direction: "outbound" as const,
      origin: "bot" as const,
      type: "text" as const,
      text: "R$ 80.",
      status: "sent" as const,
      wamid: crypto.randomUUID(),
      sentAt: clock.now(),
    })),
  );
  const previousRequests = model.requests.length;
  expect(await worker.run(conversationId)).toBe("handoff");
  expect(model.requests).toHaveLength(previousRequests);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    waiting: true,
    handoffReason: "contact_cap_reached",
  });
  expect(
    await db
      .select({ outcome: botTurnRecord.outcome, handoffReason: botTurnRecord.handoffReason })
      .from(botTurnRecord),
  ).toEqual([{ outcome: "handoff", handoffReason: "contact_cap_reached" }]);
  const other = (await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: "5511999990002",
    profileName: null,
    text: "Preço?",
    sentAt: clock.now(),
  }))!;
  model.script({ text: "R$ 80." });
  expect(await worker.run(other)).toBe("sent");
  expect(sender.sent).toHaveLength(1);
});

test("exhaustion hands off a new Contact message even while Schedule pauses replies", async () => {
  const { scope, clock, model, sender, activation, conversationId, worker, repository } =
    await setup();
  await activation.activate(scope);
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, {
    ...testBotSettings,
    schedule: "outside_business_hours",
  });
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 5000 });
  const previousRequests = model.requests.length;
  await worker.run(conversationId);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    waiting: true,
    handoffReason: "allowance_exhausted",
  });
  expect(model.requests).toHaveLength(previousRequests);
  expect(sender.sent).toHaveLength(0);
});

test("the 4,000th acknowledged reply warns the owner; email failure never resends or recounts the Bot reply", async () => {
  const { scope, clock, model, sender, activation, conversationId, dependencies } = await setup();
  await activation.activate(scope);
  const mailer = createTestMailer();
  const allowance = createBotAllowance({ db, clock, mailer });
  const worker = createLiveBot({ ...dependencies, allowance });
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 3999 });
  model.script({ text: "Resposta que atinge o aviso." });
  mailer.failNext();
  // A failed email does not fail a turn whose reply was sent.
  expect(await worker.run(conversationId)).toBe("sent");
  expect(mailer.sent).toHaveLength(0);
  // The daily task delivers it once the Mailer recovers.
  await allowance.retryWarnings();
  await allowance.retryWarnings();
  await worker.run(conversationId);
  expect(await allowance.status(scope)).toMatchObject({ used: 4000, warning: true });
  expect(mailer.sent).toHaveLength(1);
  expect(sender.sent).toHaveLength(1);
});

test("concurrent Conversations may finish their in-flight replies at the limit, without losing counts", async () => {
  const { scope, route, clock, model, sender, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 4999 });
  const otherConversationId = (await recordInboundTextMessage(db, route, {
    wamid: "concurrent-contact",
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
  // A concurrent warning claim may retry a job after its reply is already durable.
  await Promise.allSettled([worker.run(conversationId), worker.run(otherConversationId)]);
  await worker.run(conversationId);
  await worker.run(otherConversationId);
  const allowance = createBotAllowance({ db, clock, mailer: createTestMailer() });
  expect(await allowance.status(scope)).toMatchObject({ used: 5001, exhausted: true });
  expect(sender.sent).toHaveLength(2);
});

test("five simultaneous Conversations cannot overshoot the monthly allowance by more than two replies", async () => {
  const { scope, route, clock, model, sender, activation, conversationId, dependencies } =
    await setup();
  await activation.activate(scope);
  await db
    .insert(botReplyUsage)
    .values({ tenantId: scope.tenantId, period: "2026-10-01", replies: 4999 });
  const ids = [conversationId];
  for (let index = 2; index <= 5; index++)
    ids.push(
      (await recordInboundTextMessage(db, route, {
        wamid: `parallel-${index}`,
        from: `551199999000${index}`,
        profileName: null,
        text: "Preço?",
        sentAt: clock.now(),
      }))!,
    );
  const accepted = Promise.withResolvers<void>();
  let arrivals = 0;
  sender.beforeAnswering(async () => {
    if (++arrivals === 3) accepted.resolve();
    await accepted.promise;
  });
  for (let index = 0; index < 5; index++) model.script({ text: "R$ 80." });
  await Promise.allSettled(ids.map((id) => createLiveBot(dependencies).run(id)));
  expect(
    await createBotAllowance({ db, clock, mailer: createTestMailer() }).status(scope),
  ).toMatchObject({ used: 5002 });
  expect(sender.sent).toHaveLength(3);
  for (const id of ids) await createLiveBot(dependencies).run(id);
  expect(sender.sent).toHaveLength(3);
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
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, {
    ...testBotSettings,
    schedule: "outside_business_hours",
  });
  await createLiveBot({ ...dependencies, model: null }).run(conversationId);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
});

test("an unavailable sender hands off after generation", async () => {
  const { scope, model, sender, activation, conversationId, repository, dependencies } =
    await setup();
  await activation.activate(scope);
  model.script({ text: "Resposta." });
  await createLiveBot({
    ...dependencies,
    getSender: () => {
      throw new Error("unconfigured");
    },
  }).run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_unavailable",
  });
});

test("a Model Handoff is durable before the Meta call starts", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  model.script({
    toolCalls: [{ id: "handoff", name: "handoff", input: { reason: "contact_request" } }],
  });
  let ownership: unknown;
  sender.beforeAnswering(async () => {
    ownership = await repository.getConversation(conversationId);
  });
  await worker.run(conversationId);
  expect(ownership).toMatchObject({ owner: "team", handoffReason: "contact_request" });
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
    handoffReason: "bot_unavailable",
  });
  expect((await repository.listMessages(conversationId))!.messages).toContainEqual(
    expect.objectContaining({ origin: "bot", status: "failed", wamid: null }),
  );
});

const overloaded = () =>
  new RetryableError("Model temporarily unavailable", { cause: new Error("529 overloaded") });

test("a transient Model failure retries the job, then answers with the Bot still in charge", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  model.script(overloaded(), { text: "O corte custa R$ 80." });
  expect(await worker.run(conversationId, { attempt: 1 })).toBe("retry");
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
  expect(await worker.run(conversationId, { attempt: 2 })).toBe("sent");
  expect(sender.sent).toEqual([expect.objectContaining({ text: "O corte custa R$ 80." })]);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
});

test("a retried attempt records the tokens it used before the transient failure", async () => {
  const { scope, model, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  model.script(
    // Refused, so the core asks again, and that request fails.
    {
      toolCalls: [{ id: "x", name: "unknown", input: {} }],
      usage: { inputTokens: 120, outputTokens: 7 },
    },
    overloaded(),
    { text: "O corte custa R$ 80.", usage: { inputTokens: 90, outputTokens: 12 } },
  );
  expect(await worker.run(conversationId, { attempt: 1 })).toBe("retry");
  expect(await worker.run(conversationId, { attempt: 2 })).toBe("sent");
  const records = await db
    .select({
      outcome: botTurnRecord.outcome,
      inputTokens: botTurnRecord.inputTokens,
      outputTokens: botTurnRecord.outputTokens,
      toolRoundTrips: botTurnRecord.toolRoundTrips,
    })
    .from(botTurnRecord)
    .orderBy(botTurnRecord.at, botTurnRecord.outcome);
  expect(records).toEqual([
    { outcome: "retried", inputTokens: 120, outputTokens: 7, toolRoundTrips: 1 },
    { outcome: "sent", inputTokens: 90, outputTokens: 12, toolRoundTrips: 0 },
  ]);
});

test("a reservation that loses the last reply slot to a concurrent turn asks for a retry", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup({
    ...createTestBotAllowance(),
    async reserve() {
      throw new ReservationRaceError("Reply allowance is busy; retry the Bot turn");
    },
  });
  await activation.activate(scope);
  model.script({ text: "Resposta." });
  expect(await worker.run(conversationId)).toBe("retry");
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({ owner: "bot" });
});

test("a Model that keeps failing hands off as unavailable on the job's last attempt", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  model.script(...Array.from({ length: botTurnAttempts }, overloaded));
  for (let attempt = 1; attempt < botTurnAttempts; attempt++)
    expect(await worker.run(conversationId, { attempt })).toBe("retry");
  expect(await repository.getConversation(conversationId)).toMatchObject({ owner: "bot" });
  await worker.run(conversationId, { attempt: botTurnAttempts });
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_unavailable",
  });
  // Only the Handoff reply, telling the Contact the team will answer.
  expect(sender.sent).toHaveLength(1);
});

test("a Model error that is not transient hands off on the first attempt", async () => {
  const { scope, model, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  model.script(new Error("400 invalid request"));
  await worker.run(conversationId, { attempt: 1 });
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_unavailable",
  });
});

test("a send Meta refuses is retried with the same reply and sent once", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository, dependencies } =
    await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  sender.refuseNext(2);
  expect(await worker.run(conversationId)).toBe("sent");
  expect(sender.attempts).toBe(3);
  expect(sender.sent).toEqual([expect.objectContaining({ text: "O corte custa R$ 80." })]);
  expect(dependencies.sleeps).toEqual([1_000, 3_000]);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    handoffReason: null,
  });
  const replies = (await repository.listMessages(conversationId))!.messages.filter(
    ({ origin }) => origin === "bot",
  );
  expect(replies).toEqual([expect.objectContaining({ wamid: "wamid.OUT1" })]);
  await worker.run(conversationId);
  expect(sender.attempts).toBe(3);
});

test("a send Meta keeps refusing fails and hands off after the last retry", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  sender.refuseNext(3);
  expect(await worker.run(conversationId)).toBe("handoff");
  expect(sender.attempts).toBe(3);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_unavailable",
  });
  expect((await repository.listMessages(conversationId))!.messages).toContainEqual(
    expect.objectContaining({ origin: "bot", status: "failed", wamid: null }),
  );
});

test("a send that may have reached Meta, such as a timeout, is never retried", async () => {
  const { scope, model, sender, activation, conversationId, worker, repository, dependencies } =
    await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  sender.failNext();
  expect(await worker.run(conversationId, { attempt: 1 })).toBe("handoff");
  await worker.run(conversationId, { attempt: 2 });
  expect(sender.attempts).toBe(1);
  expect(dependencies.sleeps).toEqual([]);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_unavailable",
  });
});

const channelHealth = async () => (await db.select({ health: channel.health }).from(channel))[0];

test("a send refused for the credential marks the Channel unhealthy, and no Bot turn starts after it", async () => {
  const {
    scope,
    route,
    clock,
    model,
    sender,
    activation,
    conversationId,
    worker,
    queue,
    repository,
  } = await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  sender.rejectCredential();
  expect(await worker.run(conversationId)).toBe("handoff");
  // Never retried: no retry gets past a rejected credential.
  expect(sender.attempts).toBe(1);
  expect(await channelHealth()).toEqual({ health: "credential_rejected" });
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_unavailable",
  });

  // Another Contact writes: nothing is enqueued, nothing is generated or sent.
  const next = (await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: "5511999990002",
    profileName: "Bia",
    text: "Vocês abrem sábado?",
    sentAt: clock.now(),
  }))!;
  await worker.enqueue(route, next);
  expect(queue.take()).toEqual([]);
  // A job already queued, or one the sweep finds, does not reach the Model.
  const requests = model.requests.length;
  expect(await worker.run(next)).toBe("skipped");
  clock.advance(5 * 60_000);
  await worker.sweep();
  expect(queue.take()).toEqual([]);
  expect(model.requests).toHaveLength(requests);
  expect(sender.attempts).toBe(1);
  // The new Conversation stays with the Bot, to resume once reconnected.
  expect(await repository.getConversation(next)).toMatchObject({ owner: "bot" });
});

test("a transient Meta refusal never marks the Channel unhealthy", async () => {
  const { scope, model, sender, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  sender.refuseNext(3);
  expect(await worker.run(conversationId)).toBe("handoff");
  expect(await channelHealth()).toEqual({ health: "healthy" });
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
    await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, {
      ...testBotSettings,
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
    handoffReason: "bot_unavailable",
  });
});

test("a Contact message whose Bot job never ran is answered after the next sweep", async () => {
  const { scope, clock, model, sender, queue, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  model.script({ text: "O corte custa R$ 80." });
  // The message was recorded, but its run-bot-turn job was lost.
  clock.advance(2 * 60_000 - 1);
  await worker.sweep();
  expect(queue.take()).toEqual([]);

  clock.advance(1);
  await worker.sweep();
  expect(queue.take()).toEqual([{ type: "run-bot-turn", conversationId }]);
  await worker.run(conversationId);
  expect(sender.sent.map(({ text }) => text)).toEqual(["O corte custa R$ 80."]);

  // Running the sweep again changes nothing.
  await worker.sweep();
  expect(queue.take()).toEqual([]);
});

test("the sweep leaves a message skipped outside the Schedule, even once the Schedule opens after an hour", async () => {
  const { scope, clock, queue, activation, worker } = await setup();
  await activation.activate(scope);
  // Thursday 09:00 in São Paulo: business hours, so the Bot stays quiet.
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, {
    ...testBotSettings,
    schedule: "outside_business_hours",
  });
  clock.advance(2 * 60_000);
  await worker.sweep();
  expect(queue.take()).toEqual([]);
  // Saved back to always on, the message is now over an hour old.
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, testBotSettings);
  clock.advance(58 * 60_000);
  await worker.sweep();
  expect(queue.take()).toEqual([]);
});

test("the sweep leaves a Conversation with a live turn or with the team", async () => {
  const { scope, clock, queue, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  clock.advance(2 * 60_000);
  await db
    .update(conversation)
    .set({ botLeaseToken: "healthy", botLeaseUntil: new Date(clock.now().getTime() + 60_000) })
    .where(eq(conversation.id, conversationId));
  await worker.sweep();
  expect(queue.take()).toEqual([]);
  await db
    .update(conversation)
    .set({ botLeaseToken: null, botLeaseUntil: null, owner: "team", handoffReason: "claimed" })
    .where(eq(conversation.id, conversationId));
  await worker.sweep();
  expect(queue.take()).toEqual([]);
});

test("a crashed turn is recovered by the sweep and re-enqueued once", async () => {
  const { scope, clock, queue, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  clock.advance(3 * 60_000);
  await db
    .update(conversation)
    .set({ botLeaseToken: "crashed", botLeaseUntil: new Date(clock.now().getTime() - 1) })
    .where(eq(conversation.id, conversationId));
  await worker.sweep();
  expect(queue.take()).toEqual([{ type: "run-bot-turn", conversationId }]);
});

test("a Tenant whose Schedule skips 100 Conversations cannot starve another Tenant's sweep", async () => {
  const { scope, clock, queue, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  const quiet = await seedLiveBot(db);
  await db.update(channel).set({ botEnabled: true }).where(eq(channel.id, quiet.route.channelId));
  // Thursday 09:00 in São Paulo: business hours, so this Tenant's Bot stays quiet.
  await saveTestSettings(createBotSettingsEditor({ db, clock }), quiet.scope, {
    ...testBotSettings,
    schedule: "outside_business_hours",
  });
  for (let index = 0; index < 100; index++)
    await recordInboundTextMessage(db, quiet.route, {
      wamid: crypto.randomUUID(),
      from: `55119880${String(index).padStart(5, "0")}`,
      profileName: null,
      text: "Oi",
      // Older than the other Tenant's message, so they come first.
      sentAt: new Date(clock.now().getTime() - 60_000),
    });
  clock.advance(2 * 60_000);
  await worker.sweep();
  expect(queue.take()).toEqual([{ type: "run-bot-turn", conversationId }]);
});

test("expired leases in a canceled Tenant cannot block lease recovery for other Tenants", async () => {
  const { scope, clock, queue, activation, conversationId, worker } = await setup();
  await activation.activate(scope);
  const canceled = await seedLiveBot(db);
  const expired = new Date(clock.now().getTime() - 60_000);
  const ids = Array.from({ length: 100 }, (_, index) => `canceled-${index}`);
  await db
    .insert(contact)
    .values(ids.map((id, index) => ({ id, tenantId: canceled.route.tenantId, phone: `${index}` })));
  await db.insert(conversation).values(
    ids.map((id) => ({
      id,
      tenantId: canceled.route.tenantId,
      channelId: canceled.route.channelId,
      contactId: id,
      lastMessageAt: expired,
      botLeaseToken: "crashed",
      // Earlier than the other Tenant's, so they come first.
      botLeaseUntil: new Date(expired.getTime() - 1),
    })),
  );
  await db
    .update(organization)
    .set({ canceledAt: clock.now() })
    .where(eq(organization.id, canceled.route.tenantId));
  await db
    .update(conversation)
    .set({ botLeaseToken: "crashed", botLeaseUntil: expired })
    .where(eq(conversation.id, conversationId));
  await worker.sweep();
  expect(queue.take()).toEqual([{ type: "run-bot-turn", conversationId }]);
});

test("one sweep re-enqueues at most 100 Conversations", async () => {
  const { scope, route, clock, queue, activation, worker } = await setup();
  await activation.activate(scope);
  for (let index = 0; index < 100; index++)
    await recordInboundTextMessage(db, route, {
      wamid: crypto.randomUUID(),
      from: `55119880${String(index).padStart(5, "0")}`,
      profileName: null,
      text: "Oi",
      sentAt: clock.now(),
    });
  clock.advance(2 * 60_000);
  await worker.sweep();
  expect(queue.take()).toHaveLength(100);
});

test("the sweep fails stuck sends and clears expired leases", async () => {
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
  await worker.sweep();
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "bot_unavailable",
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
      .set({ owner: "team", handoffReason: "contact_request" })
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
  const { scope, model, sender, activation, conversationId, worker, repository } = await setup(
    createTestBotAllowance(async () => allowed),
  );
  await activation.activate(scope);
  model.script(() => {
    allowed = false;
    return { text: "Resposta." };
  });
  await worker.run(conversationId);
  expect(sender.sent).toHaveLength(0);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "team",
    handoffReason: "allowance_exhausted",
  });
});

test("the sweep preserves a live lease and its pending send", async () => {
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
  await worker.sweep();
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

// A Contact writing in a burst, with each job delivered as QStash would: after
// its delay, in order (#144).
const setupBurst = async () => {
  const seeded = await setup(undefined, burstWait);
  const { scope, route, clock, queue, activation, conversationId, worker } = seeded;
  await activation.activate(scope);
  const write = async (text: string) => {
    await recordInboundTextMessage(db, route, {
      wamid: crypto.randomUUID(),
      from: "5511999990001",
      profileName: null,
      text,
      sentAt: clock.now(),
    });
    await worker.enqueue(route, conversationId);
  };
  // When each job falls due, stamped as it is enqueued.
  const dueAt = new Map<BotJob, number>();
  const enqueue = queue.enqueue;
  queue.enqueue = async (jobs) => {
    for (const job of jobs) dueAt.set(job, clock.now().getTime() + (job.delaySeconds ?? 0) * 1_000);
    await enqueue(jobs);
  };
  // Only live turns count, not the sandbox test that activated the Bot.
  seeded.model.requests.splice(0);
  // The setup's message was written now; it enqueues its job like any other.
  await worker.enqueue(route, conversationId);
  const due: { at: number; job: BotJob }[] = [];
  const deliver = async () => {
    due.push(...queue.take().map((job) => ({ at: dueAt.get(job)!, job })));
    const next = due.shift()!;
    clock.set(new Date(Math.max(next.at, clock.now().getTime())));
    return worker.run(next.job.conversationId);
  };
  return { ...seeded, write, deliver, due };
};

test("three Contact messages within the wait get one Bot reply covering all three", async () => {
  const { clock, model, sender, queue, write, deliver, due } = await setupBurst();
  clock.advance(1_000);
  await write("Vocês abrem sábado?");
  clock.advance(1_000);
  await write("E fazem barba?");
  expect(queue.jobs.map(({ delaySeconds }) => delaySeconds)).toEqual([3, 3, 3]);
  model.script({ text: "O corte custa R$ 80, abrimos sábado e fazemos barba." });

  // The first job finds a message written a second ago and leaves the burst
  // to the later jobs.
  expect(await deliver()).toBe("waiting");
  expect(await deliver()).toBe("sent");
  expect(await deliver()).toBe("skipped");
  expect(due).toHaveLength(0);
  expect(model.requests).toHaveLength(1);
  // The burst is one Contact turn.
  expect(model.requests[0].messages.at(-1)).toEqual({
    role: "user",
    text: "Quanto custa?\n\nVocês abrem sábado?\n\nE fazem barba?",
  });
  expect(sender.sent).toHaveLength(1);
});

test("a single Contact message is answered once its job's delay has passed", async () => {
  const { clock, model, sender, deliver } = await setupBurst();
  const writtenAt = clock.now().getTime();
  model.script({ text: "O corte custa R$ 80." });
  expect(await deliver()).toBe("sent");
  expect(clock.now().getTime() - writtenAt).toBe(burstWait.delaySeconds * 1_000);
  expect(sender.sent).toHaveLength(1);
});

test("a Contact who keeps writing is answered once their first message reaches the ceiling", async () => {
  const { clock, model, sender, worker, conversationId, write } = await setupBurst();
  const firstAt = clock.now().getTime();
  model.script({ text: "Resposta." });
  let result: unknown = "waiting";
  while (result === "waiting") {
    clock.advance(1_500);
    await write(`Mensagem ${clock.now().getTime()}`);
    result = await worker.run(conversationId);
  }
  expect(result).toBe("sent");
  expect(clock.now().getTime() - firstAt).toBeGreaterThanOrEqual(burstWait.maxWaitMs);
  expect(clock.now().getTime() - firstAt).toBeLessThan(burstWait.maxWaitMs + 1_500);
  expect(sender.sent).toHaveLength(1);
});

test("a message arriving after the turn started gets its own delayed follow-up turn", async () => {
  const { route, clock, model, sender, queue, conversationId, deliver } = await setupBurst();
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
  model.script({ text: "O corte custa R$ 80." }, { text: "Fazemos barba também." });
  expect(await deliver()).toBe("sent");
  expect(queue.jobs).toEqual([{ type: "run-bot-turn", conversationId, delaySeconds: 3 }]);
  expect(await deliver()).toBe("sent");
  expect(model.requests[1].messages).toContainEqual(
    expect.objectContaining({ text: "E a barba?" }),
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

const captureCall = (input: Record<string, string>) => ({
  id: "call-1",
  name: "capture_contact_details",
  input,
});

test("details the Bot captures are stored on the Contact and reach its next turns", async () => {
  const {
    scope,
    route,
    clock,
    model,
    sender,
    activation,
    conversationId,
    worker,
    repository,
    dependencies: { notifier },
  } = await setup();
  await createCaptureSettingsEditor({ db, clock }).saveCapture(scope, {
    enabled: true,
    fields: { name: "required", email: "optional", city: "off", need: "optional" },
  });
  await activation.activate(scope);
  model.script({
    text: "Prazer, Ana! O corte custa R$ 80.",
    toolCalls: [captureCall({ name: "Ana", email: "ana@example.com" })],
  });

  await worker.run(conversationId);

  expect((await repository.getConversation(conversationId))!.contact).toMatchObject({
    name: "Ana",
    email: "ana@example.com",
    city: null,
    need: null,
  });
  expect(sender.sent.map(({ text }) => text)).toEqual(["Prazer, Ana! O corte custa R$ 80."]);
  const contactId = (await repository.getConversation(conversationId))!.contact.id;
  expect(notifier.pings).toContainEqual({ tenantId: scope.tenantId, ping: { contactId } });

  clock.advance(60_000);
  await recordInboundTextMessage(db, route, {
    wamid: "later",
    from: "5511999990001",
    profileName: null,
    text: "E a barba?",
    sentAt: clock.now(),
  });
  model.script({ text: "Não tenho essa informação." });
  await worker.run(conversationId);
  const { contact } = model.requests.at(-1)!;
  expect(contact).toContain("Name: Ana");
  expect(contact).toContain("Email: ana@example.com");
  expect(JSON.stringify(model.requests)).not.toContain("5511999990001");
});

test("a live Handoff first asks for missing required details, leaving the Bot in charge", async () => {
  const { scope, clock, model, sender, activation, conversationId, worker, repository } =
    await setup();
  await createCaptureSettingsEditor({ db, clock }).saveCapture(scope, {
    enabled: true,
    fields: { name: "required", email: "off", city: "off", need: "off" },
  });
  await activation.activate(scope);
  model.script({
    toolCalls: [{ id: "call-1", name: "handoff", input: { reason: "contact_request" } }],
  });

  expect(await worker.run(conversationId)).toBe("sent");

  expect(sender.sent.map(({ text }) => text)).toEqual([
    "Antes de chamar a equipe, me informe seu nome, por favor.",
  ]);
  expect(await repository.getConversation(conversationId)).toMatchObject({
    owner: "bot",
    waiting: false,
    handoffReason: null,
  });
});

test("a Bot capture never replaces a name a Member gave, but fills the other details", async () => {
  const { scope, clock, model, activation, conversationId, worker, repository } = await setup();
  await createCaptureSettingsEditor({ db, clock }).saveCapture(scope, {
    enabled: true,
    fields: { name: "optional", email: "optional", city: "optional", need: "off" },
  });
  await activation.activate(scope);
  const { id: contactId } = (await repository.getConversation(conversationId))!.contact;
  await repository.updateContactDetails(contactId, {
    name: "Ana Souza (Loja Centro)",
    email: "antigo@example.com",
    city: null,
    need: null,
  });
  model.script({
    text: "Anotado!",
    toolCalls: [captureCall({ name: "Aninha", email: "ana@example.com", city: "Santos" })],
  });

  await worker.run(conversationId);

  expect((await repository.getConversation(conversationId))!.contact).toMatchObject({
    name: "Ana Souza (Loja Centro)",
    email: "ana@example.com",
    city: "Santos",
  });
});
