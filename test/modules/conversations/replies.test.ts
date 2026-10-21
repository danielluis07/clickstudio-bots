import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, contact, conversation, member, message, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import { createConversationRepository, createReplyService, recordInboundTextMessage, recordMessageEcho } from "@/modules/conversations";
import { createMemberManagement, resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestMailer } from "@/test/support/mailer";
import { createTestWhatsAppSender, type TestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createTestNotifier, type TestNotifier } from "@/test/support/notifier";

let db: Database;
let owner: TenantScope;
let attendant: TenantScope;
let otherOwner: TenantScope;
let channelA: ChannelRoute;
let channelB: ChannelRoute;
let sender: TestWhatsAppSender;
let notifier: TestNotifier;
let replies: ReturnType<typeof createReplyService>;
let sequence = 0;
const clock = createTestClock();
const credential = { keyVersion: "v1", iv: "", ciphertext: "", tag: "" };

// A Contact message sent at the given time, opening the service window.
const receive = async (route: ChannelRoute, sentAt: string, from = "5511988887777") => {
  await recordInboundTextMessage(db, route, { wamid: `wamid.IN${++sequence}`, from, profileName: "Ana", text: "Oi", sentAt: new Date(sentAt) });
  const { conversations } = await createConversationRepository(db, route.tenantId === "tenant-a" ? owner : otherOwner).listConversations();
  return conversations.find((found) => found.contact.phone === from)!.id;
};

const messagesOf = async (scope: TenantScope, conversationId: string) =>
  (await createConversationRepository(db, scope).listMessages(conversationId))!.messages;

afterAll(() => closeTestDatabase(db));

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner", name: "Olga Dona", email: "owner@example.com" },
    { id: "attendant", name: "Ari Atendente", email: "attendant@example.com" },
    { id: "other", name: "Otto", email: "other@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner", role: "owner" },
    { organizationId: "tenant-a", userId: "attendant", role: "member" },
    { organizationId: "tenant-b", userId: "other", role: "owner" },
  ]);
  await db.insert(channel).values([
    { id: "channel-a", tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300", displayPhoneNumber: "+55 11 99999-0000", credential, subscriptionFields: [] },
    { id: "channel-b", tenantId: "tenant-b", wabaId: "201", phoneNumberId: "301", displayPhoneNumber: "+55 11 99999-0001", credential, subscriptionFields: [] },
  ]);
  owner = (await resolveTenantScope(db, { userId: "owner" }))!;
  attendant = (await resolveTenantScope(db, { userId: "attendant" }))!;
  otherOwner = (await resolveTenantScope(db, { userId: "other" }))!;
  channelA = (await resolveChannelPhoneNumber(db, "300"))!;
  channelB = (await resolveChannelPhoneNumber(db, "301"))!;
});

beforeEach(async () => {
  await db.delete(message);
  await db.delete(conversation);
  await db.delete(contact);
  sender = createTestWhatsAppSender();
  notifier = createTestNotifier();
  replies = createReplyService({ db, clock, notifier, getSender: () => sender });
});

describe("Dashboard replies", () => {
  test("other Members are notified of a committed reply and its failed send outcome", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T10:00:00Z"));
    sender.failNext();

    expect(await replies.sendReply(owner, { conversationId, text: "Resposta privada" })).toEqual({ ok: false, error: "send_failed" });
    expect(notifier.pings).toEqual([
      { tenantId: "tenant-a", ping: { conversationId } },
      { tenantId: "tenant-a", ping: { conversationId } },
    ]);
    expect((await messagesOf(owner, conversationId)).at(-1)?.status).toBe("failed");
  });

  test("a notification failure does not turn a successful WhatsApp send into a failed reply", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T10:00:00Z"));
    notifier.failNext();

    expect(await replies.sendReply(owner, { conversationId, text: "Resposta enviada" })).toEqual({ ok: true });
    expect(sender.sent).toHaveLength(1);
    expect((await messagesOf(owner, conversationId)).at(-1)?.wamid).toBe("wamid.OUT1");
  });

  test("a reply inside the service window is sent to the Contact and stored with its wamid and author", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T10:00:00Z"));

    expect(await replies.sendReply(attendant, { conversationId, text: "  Abrimos às 9h!  " })).toEqual({ ok: true });

    expect(sender.sent).toEqual([{
      tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300", credential,
      to: "5511988887777", text: "Abrimos às 9h!",
    }]);
    expect((await messagesOf(attendant, conversationId)).at(-1)).toEqual({
      id: expect.any(String),
      wamid: "wamid.OUT1",
      direction: "outbound",
      origin: "dashboard",
      authorName: "Ari Atendente",
      status: "pending",
      type: "text",
      text: "Abrimos às 9h!",
      sentAt: new Date("2026-10-21T10:00:00Z"),
      imported: false,
      editedAt: null,
      revokedAt: null,
    });
    // The reply is the Conversation's latest activity.
    expect((await createConversationRepository(db, owner).listConversations()).conversations[0].lastMessageAt)
      .toEqual(new Date("2026-10-21T10:00:00Z"));
  });

  test("the window closes 24 hours after the Contact's latest message, and the server refuses sends after it", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    const inbox = createConversationRepository(db, owner);

    expect((await inbox.getConversation(conversationId))?.serviceWindowClosesAt).toEqual(new Date("2026-10-22T09:00:00Z"));
    clock.set(new Date("2026-10-22T08:59:59.999Z"));
    expect(await replies.sendReply(owner, { conversationId, text: "Ainda dá tempo" })).toEqual({ ok: true });
    // The Member's own reply does not reopen the window.
    clock.set(new Date("2026-10-22T09:00:00Z"));
    expect(await replies.sendReply(owner, { conversationId, text: "Tarde demais" })).toEqual({ ok: false, error: "window_closed" });
    expect(sender.sent.map(({ text }) => text)).toEqual(["Ainda dá tempo"]);
    expect((await messagesOf(owner, conversationId)).map(({ text }) => text)).toEqual(["Oi", "Ainda dá tempo"]);

    // A new Contact message reopens it.
    await receive(channelA, "2026-10-22T10:00:00Z");
    clock.set(new Date("2026-10-22T10:05:00Z"));
    expect(await replies.sendReply(owner, { conversationId, text: "Voltamos" })).toEqual({ ok: true });
  });

  test("a send Meta refuses stays in the Conversation as failed, without a wamid", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T09:30:00Z"));
    sender.failNext();

    expect(await replies.sendReply(owner, { conversationId, text: "Oi, Ana" })).toEqual({ ok: false, error: "send_failed" });
    expect((await messagesOf(owner, conversationId)).at(-1)).toMatchObject({ wamid: null, text: "Oi, Ana", status: "failed" });
  });

  test("refuses blank replies and another Tenant's Conversation without sending", async () => {
    const conversationOfB = await receive(channelB, "2026-10-21T09:00:00Z");
    const conversationOfA = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T09:30:00Z"));

    expect(await replies.sendReply(owner, { conversationId: conversationOfB, text: "Invasão" })).toEqual({ ok: false, error: "not_found" });
    expect(await replies.sendReply(owner, { conversationId: conversationOfA, text: "   " })).toEqual({ ok: false, error: "invalid" });
    expect(await replies.sendReply(owner, { conversationId: conversationOfA, text: "a".repeat(4097) })).toEqual({ ok: false, error: "invalid" });
    expect(sender.sent).toEqual([]);
    expect((await messagesOf(otherOwner, conversationOfB)).map(({ text }) => text)).toEqual(["Oi"]);
  });

  test("echoes are classified as the team's app replies, or as echoes of the platform's own sends", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T09:30:00Z"));
    await replies.sendReply(owner, { conversationId, text: "Pelo painel" });
    const echo = (wamid: string, text: string) =>
      recordMessageEcho(db, channelA, { wamid, to: "5511988887777", text, sentAt: new Date("2026-10-21T09:31:00Z") });

    expect(await echo("wamid.OUT1", "Pelo painel")).toEqual({ echo: "own_echo", conversationId });
    expect(await echo("wamid.APP1", "Pelo app")).toEqual({ echo: "app_reply", conversationId });
    // A repeated echo keeps its classification.
    expect(await echo("wamid.APP1", "Pelo app")).toEqual({ echo: "app_reply", conversationId });
    expect(await echo("wamid.OUT1", "Pelo painel")).toEqual({ echo: "own_echo", conversationId });

    expect((await messagesOf(owner, conversationId)).map(({ origin, text }) => ({ origin, text }))).toEqual([
      { origin: "contact", text: "Oi" },
      { origin: "dashboard", text: "Pelo painel" },
      { origin: "app", text: "Pelo app" },
    ]);
  });

  test("the echo of a dashboard reply arriving before Meta's answer leaves one reply", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T09:30:00Z"));
    sender.beforeAnswering((wamid) =>
      recordMessageEcho(db, channelA, { wamid, to: "5511988887777", text: "Pelo painel", sentAt: new Date("2026-10-21T09:30:01Z") }));

    expect(await replies.sendReply(attendant, { conversationId, text: "Pelo painel" })).toEqual({ ok: true });

    // The echo showed the reply was sent, and that is kept.
    expect((await messagesOf(owner, conversationId)).map(({ wamid, origin, authorName, status }) => ({ wamid, origin, authorName, status }))).toEqual([
      { wamid: expect.any(String), origin: "contact", authorName: null, status: null },
      { wamid: "wamid.OUT1", origin: "dashboard", authorName: "Ari Atendente", status: "sent" },
    ]);
    // Once the wamid is stored, the same echo is the platform's own.
    expect(await recordMessageEcho(db, channelA, { wamid: "wamid.OUT1", to: "5511988887777", text: "Pelo painel", sentAt: new Date("2026-10-21T09:30:01Z") }))
      .toEqual({ echo: "own_echo", conversationId });
  });

  test("replies by a removed Member keep their text but lose their author", async () => {
    const conversationId = await receive(channelA, "2026-10-21T09:00:00Z");
    clock.set(new Date("2026-10-21T09:30:00Z"));
    await replies.sendReply(attendant, { conversationId, text: "Já verifico" });
    await replies.sendReply(owner, { conversationId, text: "Obrigada, Ari" });
    const management = createMemberManagement({ db, clock, mailer: createTestMailer(), appUrl: "https://example.com" });

    expect(await management.removeMember(owner, attendant.memberId)).toEqual({ ok: true });
    expect((await messagesOf(owner, conversationId)).map(({ origin, authorName, text }) => ({ origin, authorName, text }))).toEqual([
      { origin: "contact", authorName: null, text: "Oi" },
      { origin: "dashboard", authorName: null, text: "Já verifico" },
      { origin: "dashboard", authorName: "Olga Dona", text: "Obrigada, Ari" },
    ]);
  });
});
