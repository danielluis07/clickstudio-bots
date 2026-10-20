import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, contact, conversation, member, message, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import { createConversationRepository, recordInboundTextMessage } from "@/modules/conversations";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestDatabase } from "@/test/support/database";

let db: Database;
let tenantA: TenantScope;
let tenantB: TenantScope;
let channelA: ChannelRoute;
let channelB: ChannelRoute;
let sequence = 0;

const receive = (route: ChannelRoute, from: string, text: string, sentAt: string, profileName: string | null = null) =>
  recordInboundTextMessage(db, route, { wamid: `wamid.${++sequence}`, from, profileName, text, sentAt: new Date(sentAt) });

const inboxOf = (scope: TenantScope) => createConversationRepository(db, scope);

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner-a", name: "Owner A", email: "a@example.com" },
    { id: "owner-b", name: "Owner B", email: "b@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-b", userId: "owner-b", role: "owner" },
  ]);
  const credential = { keyVersion: "v1", iv: "", ciphertext: "", tag: "" };
  await db.insert(channel).values([
    { id: "channel-a", tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300", displayPhoneNumber: "+55 11 99999-0000", credential, subscriptionFields: [] },
    { id: "channel-b", tenantId: "tenant-b", wabaId: "201", phoneNumberId: "301", displayPhoneNumber: "+55 11 99999-0001", credential, subscriptionFields: [] },
  ]);
  tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  tenantB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
  channelA = (await resolveChannelPhoneNumber(db, "300"))!;
  channelB = (await resolveChannelPhoneNumber(db, "301"))!;
});

beforeEach(async () => {
  await db.delete(message);
  await db.delete(conversation);
  await db.delete(contact);
});

describe("Inbox Conversation list", () => {
  test("lists the Tenant's Conversations with the most recent activity first", async () => {
    await receive(channelA, "5511900000001", "Bom dia", "2026-10-20T09:00:00Z", "Ana");
    await receive(channelA, "5511900000002", "Olá", "2026-10-20T10:00:00Z", "Bruno");
    await receive(channelA, "5511900000001", "Ainda estão abertos?", "2026-10-20T11:00:00Z", "Ana");
    await receive(channelB, "5511900000003", "Oi", "2026-10-20T12:00:00Z", "Carla");

    const { conversations } = await inboxOf(tenantA).listConversations();

    expect(conversations).toEqual([
      {
        id: expect.any(String),
        channelId: "channel-a",
        contact: { id: expect.any(String), phone: "5511900000001", profileName: "Ana", name: null },
        lastMessageAt: new Date("2026-10-20T11:00:00Z"),
        lastMessageText: "Ainda estão abertos?",
      },
      {
        id: expect.any(String),
        channelId: "channel-a",
        contact: { id: expect.any(String), phone: "5511900000002", profileName: "Bruno", name: null },
        lastMessageAt: new Date("2026-10-20T10:00:00Z"),
        lastMessageText: "Olá",
      },
    ]);
  });

  test("search narrows the list by Contact name or phone", async () => {
    await receive(channelA, "5511900000001", "Bom dia", "2026-10-20T09:00:00Z", "Ana Souza");
    await receive(channelA, "5521988887777", "Olá", "2026-10-20T10:00:00Z", "Bruno");
    await receive(channelA, "5511900000003", "Oi", "2026-10-20T11:00:00Z", null);
    await receive(channelB, "5511900000004", "Oi", "2026-10-20T12:00:00Z", "Ana Lima");

    const phonesFor = async (search: string) =>
      (await inboxOf(tenantA).listConversations({ search })).conversations.map(({ contact }) => contact.phone);

    expect(await phonesFor("souza")).toEqual(["5511900000001"]);
    expect(await phonesFor("ana")).toEqual(["5511900000001"]);
    // Phone searches ignore formatting, as Members type numbers either way.
    expect(await phonesFor("(21) 98888-7777")).toEqual(["5521988887777"]);
    expect(await phonesFor("0000003")).toEqual(["5511900000003"]);
    // Digits inside a name search do not match phones.
    expect(await phonesFor("Bruno 1")).toEqual([]);
    // Wildcards are matched literally.
    expect(await phonesFor("%")).toEqual([]);
    expect(await phonesFor("  ")).toEqual(["5511900000003", "5521988887777", "5511900000001"]);
  });

  test("pages through the list with a cursor, without skipping Conversations active at the same time", async () => {
    for (const phone of ["5511900000001", "5511900000002", "5511900000003", "5511900000004", "5511900000005"]) {
      await receive(channelA, phone, "Oi", phone === "5511900000005" ? "2026-10-20T10:00:00Z" : "2026-10-20T09:00:00Z");
    }

    const inbox = inboxOf(tenantA);
    const first = await inbox.listConversations({ limit: 2 });
    const second = await inbox.listConversations({ limit: 2, cursor: first.nextCursor });
    const third = await inbox.listConversations({ limit: 2, cursor: second.nextCursor });

    expect([first, second, third].map(({ conversations }) => conversations.length)).toEqual([2, 2, 1]);
    expect(third.nextCursor).toBeNull();
    const paged = [first, second, third].flatMap(({ conversations }) => conversations);
    expect(paged.map(({ contact }) => contact.phone)[0]).toBe("5511900000005");
    expect(new Set(paged.map(({ id }) => id)).size).toBe(5);
    expect(paged).toEqual((await inbox.listConversations()).conversations);
  });
});

describe("Conversation view", () => {
  test("opens a Conversation with its Contact and messages in order with timestamps", async () => {
    // Delivered out of order; the view orders by when each was sent.
    await receive(channelA, "5511900000001", "Segunda", "2026-10-20T09:05:00Z", "Ana");
    await receive(channelA, "5511900000001", "Primeira", "2026-10-20T09:00:00Z", "Ana");
    const inbox = inboxOf(tenantA);
    const [{ id }] = (await inbox.listConversations()).conversations;

    expect(await inbox.getConversation(id)).toEqual({
      id,
      channelId: "channel-a",
      contact: { id: expect.any(String), phone: "5511900000001", profileName: "Ana", name: null },
    });
    expect(await inbox.listMessages(id)).toEqual({
      messages: [
        { id: expect.any(String), wamid: expect.any(String), direction: "inbound", type: "text", text: "Primeira", sentAt: new Date("2026-10-20T09:00:00Z") },
        { id: expect.any(String), wamid: expect.any(String), direction: "inbound", type: "text", text: "Segunda", sentAt: new Date("2026-10-20T09:05:00Z") },
      ],
      nextCursor: null,
    });
    expect((await inbox.listConversations()).conversations[0].lastMessageAt).toEqual(new Date("2026-10-20T09:05:00Z"));
  });

  test("shows the latest messages first and pages back to older ones", async () => {
    for (const minute of [1, 2, 3, 4, 5]) {
      await receive(channelA, "5511900000001", `Mensagem ${minute}`, `2026-10-20T09:0${minute}:00Z`);
    }
    const inbox = inboxOf(tenantA);
    const [{ id }] = (await inbox.listConversations()).conversations;
    const textsOf = (page: Awaited<ReturnType<typeof inbox.listMessages>>) => page?.messages.map(({ text }) => text);

    const latest = await inbox.listMessages(id, { limit: 2 });
    const older = await inbox.listMessages(id, { limit: 2, cursor: latest!.nextCursor });
    const oldest = await inbox.listMessages(id, { limit: 2, cursor: older!.nextCursor });

    expect(textsOf(latest)).toEqual(["Mensagem 4", "Mensagem 5"]);
    expect(textsOf(older)).toEqual(["Mensagem 2", "Mensagem 3"]);
    expect(textsOf(oldest)).toEqual(["Mensagem 1"]);
    expect(oldest!.nextCursor).toBeNull();
  });

  test("refuses another Tenant's Conversation", async () => {
    await receive(channelB, "5511900000001", "Oi", "2026-10-20T09:00:00Z");
    const [{ id }] = (await inboxOf(tenantB).listConversations()).conversations;

    expect(await inboxOf(tenantA).getConversation(id)).toBeNull();
    expect(await inboxOf(tenantA).listMessages(id)).toBeNull();
  });
});

describe("Contact panel", () => {
  test("a Member renames a Contact; the name survives new messages and is searchable", async () => {
    await receive(channelA, "5511900000001", "Oi", "2026-10-20T09:00:00Z", "Ana");
    const inbox = inboxOf(tenantA);
    const [{ id, contact: { id: contactId } }] = (await inbox.listConversations()).conversations;

    expect(await inbox.renameContact(contactId, "  Ana Souza (Loja Centro)  ")).toEqual({
      id: contactId, phone: "5511900000001", profileName: "Ana", name: "Ana Souza (Loja Centro)",
    });
    await receive(channelA, "5511900000001", "Tudo bem?", "2026-10-20T09:05:00Z", "Ana WhatsApp");

    expect((await inbox.getConversation(id))?.contact).toEqual({
      id: contactId, phone: "5511900000001", profileName: "Ana WhatsApp", name: "Ana Souza (Loja Centro)",
    });
    expect((await inbox.listConversations({ search: "loja centro" })).conversations.map((found) => found.id)).toEqual([id]);
  });

  test("clearing the name falls back to the WhatsApp profile name", async () => {
    await receive(channelA, "5511900000001", "Oi", "2026-10-20T09:00:00Z", "Ana");
    const inbox = inboxOf(tenantA);
    const [{ contact: { id: contactId } }] = (await inbox.listConversations()).conversations;
    await inbox.renameContact(contactId, "Ana Souza");

    expect((await inbox.renameContact(contactId, "   "))?.name).toBeNull();
  });

  test("refuses to rename another Tenant's Contact", async () => {
    await receive(channelB, "5511900000001", "Oi", "2026-10-20T09:00:00Z", "Ana");
    const [{ id, contact: { id: contactId } }] = (await inboxOf(tenantB).listConversations()).conversations;

    expect(await inboxOf(tenantA).renameContact(contactId, "Invasor")).toBeNull();
    expect((await inboxOf(tenantB).getConversation(id))?.contact.name).toBeNull();
  });
});
