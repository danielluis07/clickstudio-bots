import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import {
  channel,
  contact,
  conversation,
  inboxEvent,
  member,
  message,
  messageChange,
  organization,
  user,
} from "@/db/schema";
import {
  createConversationRepository,
  deleteContact,
  recordImportedHistory,
  recordInboundTextMessage,
  recordMessageEcho,
} from "@/modules/conversations";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createWebhookInbox, pruneInboxEvents } from "@/modules/webhook-inbox";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import {
  contactSyncChange,
  historyChange,
  messageEchoChange,
  metaAppSecret,
  metaDelivery,
  referencingChange,
  signMetaDelivery,
  statusChange,
  textMessageChange,
} from "@/test/support/meta-webhook";

let db: Database;
let owner: TenantScope;
let attendant: TenantScope;
let otherOwner: TenantScope;
let route: ChannelRoute;
const clock = createTestClock(new Date("2026-10-21T12:00:00Z"));
const notifier = createTestNotifier();
const queue = createTestJobQueue();
let inbox: ReturnType<typeof createWebhookInbox>;
let sequence = 0;
const phone = "5511988887777";
const repository = () => createConversationRepository(db, owner);
const remove = (contactId: string, scope = owner) =>
  deleteContact({ db, scope, clock, notifier, contactId });
const receive = () =>
  recordInboundTextMessage(db, route, {
    wamid: `wamid.delete.${++sequence}`,
    from: phone,
    profileName: "Ana",
    text: "Meus dados",
    sentAt: new Date(clock.now().getTime() - 60 * 60 * 1000),
  });
const deliver = async (...changes: Parameters<typeof metaDelivery>) => {
  const body = metaDelivery(...changes);
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  for (const job of queue.take()) await inbox.process(job.inboxEventId);
};

afterAll(() => closeTestDatabase(db));
beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner", name: "Owner", email: "owner@example.com" },
    { id: "attendant", name: "Attendant", email: "attendant@example.com" },
    { id: "other", name: "Other", email: "other@example.com" },
    { id: "admin", name: "Admin", email: "admin@example.com", role: "admin" },
  ]);
  await db.insert(organization).values([
    { id: "tenant", name: "Tenant", slug: "tenant" },
    { id: "other", name: "Other", slug: "other" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant", userId: "owner", role: "owner" },
    { organizationId: "tenant", userId: "attendant", role: "member" },
    { organizationId: "other", userId: "other", role: "owner" },
  ]);
  await db.insert(channel).values({
    id: "channel",
    tenantId: "tenant",
    wabaId: "200",
    phoneNumberId: "300",
    displayPhoneNumber: "+5511999990000",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
    subscriptionFields: [],
  });
  owner = (await resolveTenantScope(db, { userId: "owner" }))!;
  attendant = (await resolveTenantScope(db, { userId: "attendant" }))!;
  otherOwner = (await resolveTenantScope(db, { userId: "other" }))!;
  route = (await resolveChannelPhoneNumber(db, "300"))!;
  inbox = createWebhookInbox({ db, clock, queue, notifier, appSecret: metaAppSecret });
});
beforeEach(async () => {
  await db.delete(contact);
  await db.delete(messageChange);
  await db.delete(inboxEvent);
  // Each test deletes at a later time, so the deletion marker remains useful
  // without exposing its internal representation to the tests.
  clock.advance(24 * 60 * 60 * 1000);
  notifier.pings.length = 0;
  queue.take();
});

test("only an owner can delete a Contact in their Tenant", async () => {
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  expect(await remove(found.contact.id, attendant)).toEqual({ ok: false, error: "forbidden" });
  expect(await remove(found.contact.id, otherOwner)).toEqual({ ok: false, error: "not_found" });
  expect(await repository().getConversation(conversationId!)).not.toBeNull();
  expect(await remove(found.contact.id)).toEqual({ ok: true });
  expect(await repository().getConversation(conversationId!)).toBeNull();
  expect(await repository().listMessages(conversationId!)).toBeNull();
  expect(await repository().listConversations()).toEqual({ conversations: [], nextCursor: null });
  expect(notifier.pings).toEqual([{ tenantId: "tenant", ping: { contactId: found.contact.id } }]);
});

test("a retained pre-deletion inbox event cannot recreate a Contact, including dead-letter replay", async () => {
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  const body = metaDelivery(
    textMessageChange({
      phoneNumberId: "300",
      wamid: "wamid.retained",
      timestamp: String(clock.now().getTime() / 1000 - 60),
    }),
  );
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  await inbox.fail(job.inboxEventId, "failed-job");
  clock.advance(1000);
  expect(await remove(found.contact.id)).toEqual({ ok: true });
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "ignored" });
  expect((await repository().listConversations()).conversations).toEqual([]);
});

test("a new message creates a fresh Contact while late history and echoes cannot restore deleted content", async () => {
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  const oldTime = String(clock.now().getTime() / 1000 - 60);
  expect(await remove(found.contact.id)).toEqual({ ok: true });
  clock.advance(1000);
  await deliver(
    messageEchoChange({ phoneNumberId: "300", wamid: "wamid.old-echo", timestamp: oldTime }),
    historyChange({
      phoneNumberId: "300",
      threads: [
        { id: phone, messages: [{ wamid: "wamid.old-history", from: phone, timestamp: oldTime }] },
      ],
    }),
  );
  expect((await repository().listConversations()).conversations).toEqual([]);
  await deliver(
    textMessageChange({
      phoneNumberId: "300",
      wamid: "wamid.new",
      timestamp: String(clock.now().getTime() / 1000),
      body: "Novo contato",
    }),
  );
  const {
    conversations: [fresh],
  } = await repository().listConversations();
  expect(fresh.contact.id).not.toBe(found.contact.id);
  expect(fresh.id).not.toBe(conversationId);
  await deliver(
    historyChange({
      phoneNumberId: "300",
      chunkOrder: 2,
      threads: [
        {
          id: phone,
          messages: [
            { wamid: "wamid.mixed-old", from: phone, timestamp: oldTime },
            { wamid: "wamid.new", from: phone, timestamp: String(clock.now().getTime() / 1000) },
          ],
        },
      ],
    }),
  );
  expect((await repository().listMessages(fresh.id))!.messages.map(({ text }) => text)).toEqual([
    "Novo contato",
  ]);
  await deliver(
    contactSyncChange({
      phoneNumberId: "300",
      contacts: [{ phone, fullName: "Nome excluído", timestamp: oldTime }],
    }),
  );
  expect((await repository().getConversation(fresh.id))!.contact.appName).toBeNull();
});

test("deletion erases all Contact rows and edits, even edits whose original has not arrived", async () => {
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  const body = metaDelivery(
    referencingChange({
      phoneNumberId: "300",
      wamid: "wamid.orphan-edit",
      originalWamid: "wamid.not-arrived",
      type: "edit",
      timestamp: String(clock.now().getTime() / 1000 - 10),
      body: "Dados pessoais editados",
    }),
  );
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  await inbox.process(job.inboxEventId);
  expect(await remove(found.contact.id)).toEqual({ ok: true });
  // A privacy deletion must erase storage, not merely hide it from the inbox.
  expect(await db.select().from(contact)).toEqual([]);
  expect(await db.select().from(conversation)).toEqual([]);
  expect(await db.select().from(message)).toEqual([]);
  expect(await db.select().from(messageChange)).toEqual([]);
});

test("an event received before deletion stays suppressed even with a later message timestamp, and raw inbox data expires", async () => {
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  const body = metaDelivery(
    textMessageChange({
      phoneNumberId: "300",
      wamid: "wamid.future-timestamp",
      timestamp: String(clock.now().getTime() / 1000 + 60),
    }),
  );
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  clock.advance(1000);
  expect(await remove(found.contact.id)).toEqual({ ok: true });
  expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "ignored" });
  expect((await repository().listConversations()).conversations).toEqual([]);
  clock.advance(30 * 24 * 60 * 60 * 1000);
  expect(await pruneInboxEvents(db, clock)).toBe(1);
  expect(await inbox.process(job.inboxEventId)).toEqual({ ok: false, error: "not_found" });
});

test.each(["echo", "history", "edit", "contact_sync"] as const)(
  "a retained %s cannot alter a fresh Contact even when its event timestamp is after deletion",
  async (kind) => {
    const conversationId = await receive();
    const found = (await repository().getConversation(conversationId!))!;
    const timestamp = String(clock.now().getTime() / 1000 + 60);
    const changes = {
      echo: messageEchoChange({ phoneNumberId: "300", wamid: "wamid.retained-echo", timestamp }),
      history: historyChange({
        phoneNumberId: "300",
        threads: [
          { id: phone, messages: [{ wamid: "wamid.retained-history", from: phone, timestamp }] },
        ],
      }),
      edit: referencingChange({
        phoneNumberId: "300",
        wamid: "wamid.retained-edit",
        originalWamid: "wamid.fresh",
        type: "edit",
        timestamp,
        body: "Dados excluídos",
      }),
      contact_sync: contactSyncChange({
        phoneNumberId: "300",
        contacts: [{ phone, fullName: "Nome excluído", timestamp }],
      }),
    };
    const body = metaDelivery(changes[kind]);
    await inbox.receive({ body, signature: signMetaDelivery(body) });
    const [job] = queue.take();
    clock.advance(1000);
    expect(await remove(found.contact.id)).toEqual({ ok: true });
    clock.advance(1000);
    const freshId = await recordInboundTextMessage(db, route, {
      wamid: "wamid.fresh",
      from: phone,
      profileName: "Ana",
      text: "Novo contato",
      sentAt: clock.now(),
    });
    const fresh = await repository().getConversation(freshId!);
    const messages = await repository().listMessages(freshId!);
    notifier.pings.length = 0;

    expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "ignored" });
    expect(await repository().getConversation(freshId!)).toEqual(fresh);
    expect(await repository().listMessages(freshId!)).toEqual(messages);
    expect(await db.select().from(messageChange)).toEqual([]);
    expect(notifier.pings).toEqual([]);
  },
);

test("mixed history creates a fresh Conversation from only its admitted messages, in any order", async () => {
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  const oldTime = new Date(clock.now().getTime() - 1000);
  expect(await remove(found.contact.id)).toEqual({ ok: true });
  clock.advance(1000);
  const first = clock.now();
  clock.advance(1000);
  const latest = clock.now();
  const freshId = await recordImportedHistory(db, route, {
    phone,
    receivedAt: clock.now(),
    messages: [
      {
        wamid: "wamid.latest",
        direction: "outbound",
        status: "read",
        text: "Depois",
        sentAt: latest,
      },
      {
        wamid: "wamid.erased",
        direction: "inbound",
        status: "read",
        text: "Excluído",
        sentAt: oldTime,
      },
      {
        wamid: "wamid.first",
        direction: "inbound",
        status: "read",
        text: "Primeiro",
        sentAt: first,
      },
    ],
  });
  const fresh = (await repository().getConversation(freshId!))!;
  expect(fresh.contact.id).not.toBe(found.contact.id);
  expect(freshId).not.toBe(conversationId);
  expect((await repository().listMessages(freshId!))!.messages.map(({ text }) => text)).toEqual([
    "Primeiro",
    "Depois",
  ]);
  expect((await repository().listConversations()).conversations[0].lastMessageAt).toEqual(latest);
});

test.each(["inbound", "echo", "history"] as const)(
  "a failed %s write rolls back its new Contact and Conversation",
  async (kind) => {
    // Force a storage failure after admission and filing, through the same
    // database adapter the public event writers use.
    await db.execute(sql`alter table message add constraint reject_test_message
      check (wamid <> 'wamid.rejected')`);
    try {
      const sentAt = clock.now();
      const record = {
        inbound: () =>
          recordInboundTextMessage(db, route, {
            wamid: "wamid.rejected",
            from: phone,
            profileName: "Ana",
            text: "Oi",
            sentAt,
          }),
        echo: () =>
          recordMessageEcho(db, route, {
            wamid: "wamid.rejected",
            to: phone,
            text: "Oi",
            sentAt,
          }),
        history: () =>
          recordImportedHistory(db, route, {
            phone,
            messages: [
              { wamid: "wamid.rejected", direction: "inbound", status: "read", text: "Oi", sentAt },
            ],
          }),
      };
      await expect(record[kind]()).rejects.toThrow();
      expect(await db.select().from(contact)).toEqual([]);
      expect(await db.select().from(conversation)).toEqual([]);
      expect(await db.select().from(message)).toEqual([]);
    } finally {
      await db.execute(sql`alter table message drop constraint reject_test_message`);
    }
  },
);

test("ambiguous deletion-second messages are suppressed; a message in the next second creates a fresh Contact", async () => {
  clock.set(new Date(Math.floor(clock.now().getTime() / 1000) * 1000 + 100));
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  expect(await remove(found.contact.id)).toEqual({ ok: true });
  clock.advance(700);
  await deliver(
    textMessageChange({
      phoneNumberId: "300",
      wamid: "wamid.ambiguous-second",
      timestamp: String(Math.floor(clock.now().getTime() / 1000)),
    }),
  );
  expect((await repository().listConversations()).conversations).toEqual([]);
  clock.advance(201);
  await deliver(
    textMessageChange({
      phoneNumberId: "300",
      wamid: "wamid.next-second",
      timestamp: String(Math.floor(clock.now().getTime() / 1000)),
    }),
  );
  const {
    conversations: [fresh],
  } = await repository().listConversations();
  expect(fresh.contact.id).not.toBe(found.contact.id);
});

test("deletion erases the Contact's raw inbox events and settles their jobs, leaving other addresses", async () => {
  await db
    .insert(channel)
    .values({
      id: "other-channel",
      tenantId: "other",
      wabaId: "201",
      phoneNumberId: "301",
      displayPhoneNumber: "+5511999990001",
      credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
      subscriptionFields: [],
    })
    .onConflictDoNothing();
  const conversationId = await receive();
  const found = (await repository().getConversation(conversationId!))!;
  const processed = metaDelivery(
    textMessageChange({ phoneNumberId: "300", wamid: "wamid.erase-text", body: "Meu CPF" }),
    statusChange({ phoneNumberId: "300", wamid: "wamid.erase-reply", status: "read" }),
    messageEchoChange({ phoneNumberId: "300", wamid: "wamid.erase-echo", to: `+${phone}` }),
    referencingChange({
      phoneNumberId: "300",
      wamid: "wamid.erase-edit",
      originalWamid: "wamid.erase-text",
      type: "edit",
      body: "Meu CPF editado",
    }),
    historyChange({
      phoneNumberId: "300",
      threads: [
        {
          id: phone,
          messages: [{ wamid: "wamid.erase-history", from: phone, timestamp: "1792497600" }],
        },
      ],
    }),
    contactSyncChange({
      phoneNumberId: "300",
      contacts: [{ phone: `+${phone}`, fullName: "Ana Excluída" }],
    }),
    textMessageChange({ phoneNumberId: "300", wamid: "wamid.keep-other", from: "5511900000000" }),
    textMessageChange({ phoneNumberId: "301", wamid: "wamid.keep-tenant", from: phone }),
  );
  await inbox.receive({ body: processed, signature: signMetaDelivery(processed) });
  for (const job of queue.take()) await inbox.process(job.inboxEventId);
  const unsettled = metaDelivery(
    textMessageChange({ phoneNumberId: "300", wamid: "wamid.erase-pending" }),
    textMessageChange({ phoneNumberId: "300", wamid: "wamid.erase-failed" }),
  );
  await inbox.receive({ body: unsettled, signature: signMetaDelivery(unsettled) });
  const [, failedJob] = queue.take();
  await inbox.fail(failedJob.inboxEventId, "failed-job");
  const before = await db.select().from(inboxEvent);
  expect(before.filter((event) => event.contactPhone === phone)).toHaveLength(9);

  expect(await remove(found.contact.id)).toEqual({ ok: true });

  const after = await db.select().from(inboxEvent);
  expect(after.map(({ id }) => id).sort()).toEqual(before.map(({ id }) => id).sort());
  expect(
    after
      .filter((event) => event.contactPhone !== null)
      .map(({ dedupeKey }) => dedupeKey)
      .sort(),
  ).toEqual(["messages:wamid.keep-other", "messages:wamid.keep-tenant"]);
  const erased = after.filter((event) => event.contactPhone === null);
  expect(erased).toHaveLength(8);
  for (const event of erased) expect(event.payload).toEqual({ erased: true });
  expect(JSON.stringify(erased)).not.toContain(phone);
  expect(JSON.stringify(erased)).not.toContain("CPF");
  expect(
    erased
      .filter((event) => event.ignoredReason === "contact_deleted")
      .map(({ status, errorClass, failedAt }) => ({ status, errorClass, failedAt })),
  ).toEqual([
    { status: "ignored", errorClass: null, failedAt: null },
    { status: "ignored", errorClass: null, failedAt: null },
  ]);

  // A redelivery, a queued job and an administrator's replay restore nothing.
  await inbox.receive({ body: processed, signature: signMetaDelivery(processed) });
  await inbox.receive({ body: unsettled, signature: signMetaDelivery(unsettled) });
  expect(queue.take()).toEqual([]);
  expect(await inbox.process(failedJob.inboxEventId)).toEqual({ ok: true, status: "ignored" });
  expect(await inbox.replay("admin", failedJob.inboxEventId)).toEqual({
    ok: true,
    status: "ignored",
  });
  expect(await db.select().from(inboxEvent)).toEqual(after);
  expect(
    (await repository().listConversations()).conversations.map(({ contact }) => contact.phone),
  ).toEqual(["5511900000000"]);
});
