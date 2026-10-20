import { beforeAll, describe, expect, test } from "bun:test";
import { createTRPCClient, httpLink } from "@trpc/client";
import { hashPassword } from "better-auth/crypto";
import superjson from "superjson";
import { account, member } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createConversationRepository } from "@/modules/conversations";
import { createAuth } from "@/server/auth/create-auth";
import { createTRPCRoute } from "@/server/trpc/route";
import type { AppRouter } from "@/server/trpc/router";
import { seedConversations } from "@/test/support/conversations";
import { createTestDatabase } from "@/test/support/database";
import { createTestMailer } from "@/test/support/mailer";

const baseURL = "http://localhost:3000";
let fixture: Awaited<ReturnType<typeof seedConversations>>;
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let auth: ReturnType<typeof createAuth>;
let handle: ReturnType<typeof createTRPCRoute>;
let cookieA: string;
let cookieB: string;

const client = (cookie?: string) => createTRPCClient<AppRouter>({
  links: [httpLink({
    url: `${baseURL}/api/trpc`, transformer: superjson,
    headers: cookie ? { cookie } : {},
    fetch: (url, init) => handle(new Request(url, init as RequestInit)),
  })],
});

const signIn = async (email: string) => {
  const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: baseURL },
    body: JSON.stringify({ email, password: "test-password-123" }),
  }));
  if (!response.ok) throw new Error("Sign in failed");
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
};

beforeAll(async () => {
  db = await createTestDatabase();
  fixture = await seedConversations(db);
  const password = await hashPassword("test-password-123");
  await db.insert(account).values(["member-a", "member-b", "outsider"].map((userId) => ({ userId, accountId: userId, providerId: "credential", password })));
  auth = createAuth({ db, baseURL, secret: "test-secret-with-enough-entropy-0123456789", mailer: createTestMailer() });
  handle = createTRPCRoute({ db, getSession: (headers) => auth.api.getSession({ headers }) });
  cookieA = await signIn("a@example.com");
  cookieB = await signIn("b@example.com");
});

describe("Tenant-scoped tRPC requests", () => {
  test("rejects unauthenticated and invalid-session requests", async () => {
    await expect(client().conversations.list.query({})).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
    await expect(client("better-auth.session_token=forged").conversations.list.query({})).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
  });

  test("reads a searched Conversation and messages through the authenticated transport", async () => {
    const api = client(cookieA);
    const [ana] = await api.conversations.list.query({ search: "ana" });
    expect(await api.conversations.get.query({ id: ana.id })).toMatchObject({ contact: { name: "Ana Silva" } });
    const messages = await api.conversations.messages.query({ conversationId: ana.id });
    expect(messages.map(({ wamid }) => wamid)).toEqual(["ana-1", "ana-2", "ana-3"]);
    expect(messages[0].sentAt).toEqual(new Date("2026-10-20T10:00:00Z"));
  });

  test("persists Contact changes through the authenticated transport", async () => {
    const api = client(cookieA);
    const [ana] = await api.conversations.list.query({ search: "Ana" });
    await api.conversations.updateContact.mutate({ id: ana.contactId, name: "Ana Pereira", phone: "+55 (11) 97777-3333" });
    expect(await api.conversations.get.query({ id: ana.id })).toMatchObject({ contact: { name: "Ana Pereira", phone: "5511977773333" } });
  });

  test("refuses cross-Tenant Conversation, message and Contact requests server-side", async () => {
    const apiA = client(cookieA);
    const apiB = client(cookieB);
    const [other] = await apiB.conversations.list.query({});
    const before = await apiB.conversations.get.query({ id: other.id });
    await expect(apiA.conversations.get.query({ id: other.id })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    await expect(apiA.conversations.messages.query({ conversationId: other.id })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    await expect(apiA.conversations.updateContact.mutate({ id: other.contactId, name: "Intruso", phone: "5511999999999" })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    expect(await apiB.conversations.get.query({ id: other.id })).toEqual(before);
  });

  test("rejects client-supplied Tenant ids and invalid Contact input", async () => {
    const api = client(cookieA);
    const [own] = await api.conversations.list.query({});
    // Deliberately bypass the caller's static type, as an HTTP attacker can.
    const forgedInput = { search: "", tenantId: "tenant-b" };
    await expect(api.conversations.list.query(forgedInput)).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
    await expect(api.conversations.updateContact.mutate({ id: own.contactId, name: "Ana", phone: "invalid" })).rejects.toMatchObject({ data: { code: "BAD_REQUEST", zodError: { properties: { phone: expect.anything() } } } });
  });

  test("rechecks membership for every request even when a valid session remains", async () => {
    const outsiderCookie = await signIn("none@example.com");
    await expect(client(outsiderCookie).conversations.list.query({})).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await db.delete(member).where(eq(member.userId, "member-b"));
    await expect(client(cookieB).conversations.list.query({})).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    expect(await createConversationRepository(db, fixture.scopeA).listConversations()).toHaveLength(2);
  });
});
