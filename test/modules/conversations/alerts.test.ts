import { afterEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, user } from "@/db/schema";
import {
  createMemberManagement,
  createTenantExport,
  resolveTenantScope,
  type TenantScope,
} from "@/modules/tenancy";
import {
  createBotActivation,
  createBotSandbox,
  createBotSettingsEditor,
  createLiveBot,
  ReservationRaceError,
  type BotAllowance,
  type BotJob,
} from "@/modules/bot";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import {
  createContactDeletion,
  createConversationRepository,
  createHandoffControls,
  createMemberAlerts,
  pruneAlerts,
  createReplyService,
  recordInboundTextMessage,
} from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestBotAllowance, saveTestSettings, testBotSettings } from "@/test/support/bot";
import { createTestModel } from "@/test/support/model";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestClock } from "@/test/support/clock";
import { createTestMailer } from "@/test/support/mailer";
import { createTestNotifier, type TestNotifier } from "@/test/support/notifier";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import {
  mediaMessageChange,
  metaAppSecret,
  metaDelivery,
  signMetaDelivery,
  textMessageChange,
} from "@/test/support/meta-webhook";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const contactPhone = "5511999990001";

const addAttendant = async (tenantId: string) => {
  const userId = `attendant-${crypto.randomUUID()}`;
  await db.insert(user).values({ id: userId, name: "Ari", email: `${userId}@example.com` });
  await db.insert(member).values({ organizationId: tenantId, userId, role: "member" });
  return (await resolveTenantScope(db, { userId, activeTenantId: tenantId }))!;
};

// An activated Bot, an owner and an attendant, and one Bot-owned Conversation
// with an unanswered message.
const setup = async ({
  allowance = createTestBotAllowance(),
}: { allowance?: BotAllowance } = {}) => {
  db = await createTestDatabase();
  const seeded = await seedLiveBot(db);
  const { scope, route, clock } = seeded;
  const attendant = await addAttendant(scope.tenantId);
  const model = createTestModel();
  const sender = createTestWhatsAppSender();
  const notifier = createTestNotifier();
  const activation = createBotActivation({ db, clock });
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, testBotSettings);
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
  const receive = async (text: string, wamid: string = crypto.randomUUID()) => {
    clock.advance(1000);
    return (await recordInboundTextMessage(db, route, {
      wamid,
      from: contactPhone,
      profileName: "Ana",
      text,
      sentAt: clock.now(),
    }))!;
  };
  const conversationId = await receive("Quanto custa?");
  const worker = createLiveBot({
    burst: null,
    db,
    clock,
    model,
    queue: createTestJobQueue<BotJob>(),
    notifier,
    getSender: () => sender,
    allowance,
  });
  const alertsOf = (memberScope: TenantScope) => createMemberAlerts({ db, clock }, memberScope);
  const jobs = createTestJobQueue();
  const inbox = createWebhookInbox({
    db,
    clock,
    queue: jobs,
    notifier,
    appSecret: metaAppSecret,
    bot: worker,
  });
  // Delivers a signed Meta change and processes it as the inbox job would.
  const deliver = async (change: { field: string; value: unknown }) => {
    const body = metaDelivery(change);
    await inbox.receive({ body, signature: signMetaDelivery(body) });
    for (const job of jobs.take()) await inbox.process(job.inboxEventId);
  };
  const timestamp = () => String(Math.floor(clock.now().getTime() / 1000));
  return {
    ...seeded,
    attendant,
    model,
    sender,
    notifier,
    conversationId,
    receive,
    worker,
    alertsOf,
    deliver,
    timestamp,
    repository: createConversationRepository(db, scope),
    controls: createHandoffControls({ db, clock, notifier }),
    replies: createReplyService({ db, clock, notifier, getSender: () => sender }),
  };
};

const handOffByModel = async ({
  model,
  worker,
  conversationId,
}: Awaited<ReturnType<typeof setup>>) => {
  model.script({
    toolCalls: [{ id: "handoff", name: "handoff", input: { reason: "contact_request" } }],
  });
  await worker.run(conversationId);
};

test("a Handoff the Bot causes raises one Alert for every Member", async () => {
  const context = await setup();
  const { scope, attendant, conversationId, alertsOf } = context;

  await handOffByModel(context);

  for (const memberScope of [scope, attendant]) {
    expect(await alertsOf(memberScope).list()).toEqual({
      unread: 1,
      alerts: [
        {
          id: expect.any(String),
          kind: "handoff",
          count: 1,
          read: false,
          conversationId,
          channel: "whatsapp",
          contact: { phone: contactPhone, profileName: "Ana", appName: null, name: null },
          preview: { type: "text", text: "Quanto custa?", revoked: false },
          raisedAt: expect.any(Date),
        },
      ],
    });
  }
});

test("Assumir, a Member's reply and a return to the Bot raise no Alert", async () => {
  const { scope, attendant, conversationId, receive, controls, replies, alertsOf } = await setup();

  await controls.takeOver(scope, conversationId);
  await controls.returnToBot(scope, conversationId);
  await replies.sendReply(attendant, { conversationId, text: "Já te respondo" });
  await controls.resolve(attendant, conversationId);
  await receive("Obrigada");

  for (const memberScope of [scope, attendant])
    expect(await alertsOf(memberScope).list()).toEqual({ unread: 0, alerts: [] });
});

test("Contact messages in a team-owned Conversation merge into one unread Alert, and a retry adds nothing", async () => {
  const { scope, attendant, conversationId, receive, controls, alertsOf } = await setup();
  await controls.takeOver(scope, conversationId);

  await receive("Ainda está aí?", "wamid.second");
  await receive("Preciso remarcar", "wamid.third");
  await receive("Preciso remarcar", "wamid.third");

  const listed = await alertsOf(attendant).list();
  expect(listed.unread).toBe(1);
  expect(listed.alerts).toMatchObject([
    {
      kind: "team_message",
      count: 2,
      read: false,
      conversationId,
      preview: { type: "text", text: "Preciso remarcar", revoked: false },
    },
  ]);
});

test("reading a Conversation's Alerts makes the next message start a new one, on top", async () => {
  const { scope, attendant, conversationId, receive, controls, alertsOf } = await setup();
  await controls.takeOver(scope, conversationId);
  await receive("Ainda está aí?");

  await alertsOf(attendant).markConversationRead(conversationId);
  expect((await alertsOf(attendant).list()).unread).toBe(0);
  expect((await alertsOf(scope).list()).unread).toBe(1);

  await receive("Oi?");
  const { unread, alerts } = await alertsOf(attendant).list();
  expect(unread).toBe(1);
  expect(alerts.map(({ count, read, preview }) => ({ count, read, text: preview?.text }))).toEqual([
    { count: 1, read: false, text: "Oi?" },
    { count: 1, read: true, text: "Ainda está aí?" },
  ]);
});

// The pings a Member received on their own channel, as Alert ids.
const pingedAlerts = (notifier: TestNotifier, memberScope: TenantScope) =>
  notifier.alerts
    .filter(
      ({ tenantId, ping }) =>
        tenantId === memberScope.tenantId && ping.memberId === memberScope.memberId,
    )
    .map(({ ping }) => ping.alertId);

test("each Member's Handoff Alert is announced on their own channel with only its id", async () => {
  const context = await setup();
  const { scope, attendant, notifier, alertsOf } = context;

  await handOffByModel(context);

  for (const memberScope of [scope, attendant]) {
    const [raised] = (await alertsOf(memberScope).list()).alerts;
    expect(pingedAlerts(notifier, memberScope)).toEqual([raised.id]);
  }
  expect(notifier.alerts.map(({ ping }) => Object.keys(ping).sort())).toEqual([
    ["alertId", "memberId"],
    ["alertId", "memberId"],
  ]);
});

test("an inbound job announces the Team message Alerts it raised, and its retry announces none", async () => {
  const {
    scope,
    attendant,
    conversationId,
    controls,
    notifier,
    deliver,
    timestamp,
    phoneNumberId,
    alertsOf,
  } = await setup();
  await controls.takeOver(scope, conversationId);
  const change = textMessageChange({
    phoneNumberId,
    wamid: "wamid.team",
    from: contactPhone,
    name: "Ana",
    body: "Ainda está aí?",
    timestamp: timestamp(),
  });

  await deliver(change);
  await deliver(change);

  const [raised] = (await alertsOf(attendant).list()).alerts;
  expect(raised).toMatchObject({ kind: "team_message", count: 1 });
  expect(pingedAlerts(notifier, attendant)).toEqual([raised.id]);
});

test("an audio the Bot cannot answer raises and announces a Handoff Alert", async () => {
  const { attendant, notifier, deliver, timestamp, phoneNumberId, alertsOf, clock } = await setup();
  clock.advance(1000);

  await deliver(
    mediaMessageChange({
      type: "audio",
      phoneNumberId,
      wamid: "wamid.audio",
      from: contactPhone,
      name: "Ana",
      timestamp: timestamp(),
    }),
  );

  const { alerts } = await alertsOf(attendant).list();
  expect(alerts).toMatchObject([
    { kind: "handoff", count: 1, preview: { type: "audio", text: null } },
  ]);
  expect(pingedAlerts(notifier, attendant)).toEqual([alerts[0].id]);
});

const dayMs = 24 * 60 * 60 * 1000;

test("the daily prune deletes Alerts 30 days after their latest event", async () => {
  const context = await setup();
  const { attendant, alertsOf } = context;
  await handOffByModel(context);
  // Alerts carry the database's time, which is the real one here.
  const raised = Date.now();

  await pruneAlerts(db, createTestClock(new Date(raised + 29 * dayMs)));
  expect((await alertsOf(attendant).list()).alerts).toHaveLength(1);

  await pruneAlerts(db, createTestClock(new Date(raised + 31 * dayMs)));
  expect((await alertsOf(attendant).list()).alerts).toEqual([]);
});

test("removing a Member deletes their Alerts, and deleting the Contact deletes everyone's", async () => {
  const context = await setup();
  const { scope, attendant, clock, notifier, conversationId, alertsOf } = context;
  await handOffByModel(context);
  const [ownerAlert] = (await alertsOf(scope).list()).alerts;

  await createMemberManagement({
    db,
    clock,
    mailer: createTestMailer(),
    appUrl: "https://bots.example.com",
  }).removeMember(scope, attendant.memberId);
  expect(await alertsOf(attendant).list()).toEqual({ unread: 0, alerts: [] });
  expect((await alertsOf(scope).list()).alerts).toEqual([ownerAlert]);

  const contactId = (await context.repository.getConversation(conversationId))!.contact.id;
  expect(await createContactDeletion({ db, clock, notifier })(scope, contactId)).toEqual({
    ok: true,
  });
  expect(await alertsOf(scope).list()).toEqual({ unread: 0, alerts: [] });
});

test("the Tenant data export leaves Alerts out", async () => {
  const context = await setup();
  const { scope, clock, alertsOf } = context;
  await handOffByModel(context);
  const [raised] = (await alertsOf(scope).list()).alerts;
  await db
    .insert(user)
    .values({ id: "admin", name: "Admin", email: "admin@example.com", role: "admin" });

  const result = await createTenantExport({ db, clock }).export("admin", scope.tenantId, "json");

  if (!result.ok) throw new Error("Export failed");
  expect(result.files[0].content).not.toContain(raised.id);
});

test("a Bot Handoff whose reservation rolls back raises and announces no Alert", async () => {
  const context = await setup({
    allowance: {
      ...createTestBotAllowance(),
      reserve: async () => {
        throw new ReservationRaceError("Reply allowance is busy; retry the Bot turn");
      },
    },
  });
  const { scope, notifier, alertsOf } = context;

  await handOffByModel(context).catch(() => {});

  expect(await alertsOf(scope).list()).toEqual({ unread: 0, alerts: [] });
  expect(notifier.alerts).toEqual([]);
});
