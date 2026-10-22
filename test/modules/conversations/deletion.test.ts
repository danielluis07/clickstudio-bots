import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
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
  recordInboundTextMessage,
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
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "processed" });
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
  expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "processed" });
  expect((await repository().listConversations()).conversations).toEqual([]);
  clock.advance(30 * 24 * 60 * 60 * 1000);
  expect(await pruneInboxEvents(db, clock)).toBe(1);
  expect(await inbox.process(job.inboxEventId)).toEqual({ ok: false, error: "not_found" });
});

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
