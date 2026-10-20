import { beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { createConversationRepository, recordInboundTextMessage } from "@/modules/conversations";
import { seedConversations } from "@/test/support/conversations";
import { createTestDatabase } from "@/test/support/database";

let db: Database;
let fixture: Awaited<ReturnType<typeof seedConversations>>;

beforeAll(async () => {
  db = await createTestDatabase();
  fixture = await seedConversations(db);
});

describe("Shared inbox", () => {
  test("lists only the Member's Tenant Conversations, most recent activity first", async () => {
    const conversations = await createConversationRepository(db, fixture.scopeA).listConversations();
    expect(conversations.map(({ contactProfileName }) => contactProfileName)).toEqual(["Bruno Costa", "Ana Silva"]);
  });

  test("searches by Contact name or formatted phone without interpreting SQL wildcards", async () => {
    const inbox = createConversationRepository(db, fixture.scopeA);
    expect((await inbox.listConversations({ search: "aNA sil" })).map(({ contactProfileName }) => contactProfileName)).toEqual(["Ana Silva"]);
    expect((await inbox.listConversations({ search: "+55 (11) 98888-2222" })).map(({ contactProfileName }) => contactProfileName)).toEqual(["Bruno Costa"]);
    expect(await inbox.listConversations({ search: "%" })).toEqual([]);
    expect(await inbox.listConversations({ search: "_" })).toEqual([]);
  });

  test("opens a Conversation and reads messages chronologically with their timestamps", async () => {
    const inbox = createConversationRepository(db, fixture.scopeA);
    const [ana] = await inbox.listConversations({ search: "Ana" });
    expect(await inbox.getConversation(ana.id)).toMatchObject({
      id: ana.id,
      contact: { id: ana.contactId, name: "Ana Silva", phone: "5511988881111" },
    });
    expect((await inbox.listMessages(ana.id)).map(({ text, sentAt }) => ({ text, sentAt }))).toEqual([
      { text: "Primeira mensagem", sentAt: new Date("2026-10-20T10:00:00Z") },
      { text: "Mensagem atrasada", sentAt: new Date("2026-10-20T10:30:00Z") },
      { text: "Mensagem mais recente", sentAt: new Date("2026-10-20T12:00:00Z") },
    ]);
  });

  test("persists Contact edits and preserves them and the Conversation on the next inbound message", async () => {
    const inbox = createConversationRepository(db, fixture.scopeA);
    const [ana] = await inbox.listConversations({ search: "Ana" });
    expect(await inbox.updateContact(ana.contactId, { name: "Ana Pereira", phone: "+55 (11) 97777-3333" })).toEqual({ ok: true });
    await recordInboundTextMessage(db, fixture.routeA, {
      from: "5511988881111", profileName: "Perfil novo", wamid: "ana-4",
      text: "Voltei", sentAt: new Date("2026-10-20T14:00:00Z"),
    });
    const reopened = createConversationRepository(db, fixture.scopeA);
    expect(await reopened.getConversation(ana.id)).toMatchObject({
      contact: { name: "Ana Pereira", phone: "5511977773333" },
    });
    expect(await reopened.listConversations({ search: "Ana Pereira" })).toHaveLength(1);
    expect((await reopened.listConversations()).map(({ id }) => id)).toEqual([ana.id, expect.any(String)]);
    expect((await reopened.listMessages(ana.id)).at(-1)?.text).toBe("Voltei");
  });

  test("refuses another Tenant's Conversation and Contact, without changing their details", async () => {
    const inboxA = createConversationRepository(db, fixture.scopeA);
    const inboxB = createConversationRepository(db, fixture.scopeB);
    const [other] = await inboxB.listConversations();
    const before = await inboxB.getConversation(other.id);
    expect(await inboxA.getConversation(other.id)).toBeNull();
    expect(await inboxA.listMessages(other.id)).toEqual([]);
    expect(await inboxA.updateContact(other.contactId, { name: "Intruso", phone: "5511999999999" })).toEqual({ ok: false, error: "not_found" });
    expect(await inboxB.getConversation(other.id)).toEqual(before);
    expect(await inboxA.getConversation("missing")).toBeNull();
  });

  test("refuses invalid Contact details and leaves the saved Contact intact", async () => {
    const inbox = createConversationRepository(db, fixture.scopeA);
    const [bruno] = await inbox.listConversations({ search: "Bruno" });
    const before = await inbox.getConversation(bruno.id);
    for (const input of [{ name: "Bruno", phone: "abc123" }, { name: "x".repeat(121), phone: "5511999999999" }]) {
      expect(await inbox.updateContact(bruno.contactId, input)).toEqual({ ok: false, error: "invalid_input" });
    }
    expect(await inbox.getConversation(bruno.id)).toEqual(before);
  });
});
