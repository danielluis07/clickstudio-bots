import { beforeAll, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { createReplyService, recordInboundTextMessage } from "@/modules/conversations";
import type { TRPCContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";
import { createTestClock } from "@/test/support/clock";
import { createTestDatabase } from "@/test/support/database";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createAblyRealtime } from "@/platform/ably";
import { createTestNotifier } from "@/test/support/notifier";

let db: Database;
let conversationOfB: string;
let contactOfB: string;
const notifier = createTestNotifier();

const callerFor = (session: TRPCContext["session"]) => appRouter.createCaller({
  db,
  session,
  realtime: createAblyRealtime({ apiKey: "test.key:private-test-secret" }),
  notifier,
  replies: createReplyService({ db, clock: createTestClock(), notifier: createTestNotifier(), getSender: createTestWhatsAppSender }),
});
const ownerA = { userId: "owner-a", activeTenantId: "tenant-a" };

const codeOf = async (call: Promise<unknown>) => {
  try {
    await call;
    return "OK";
  } catch (error) {
    return error instanceof TRPCError ? error.code : error;
  }
};

// Calls a procedure by its dotted path, e.g. "conversations.list".
const callByPath = (caller: ReturnType<typeof callerFor>, path: string, input: unknown) =>
  (path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], caller) as (input: unknown) => Promise<unknown>)(input);

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner-a", name: "Owner A", email: "a@example.com" },
    { id: "owner-b", name: "Owner B", email: "b@example.com" },
    { id: "outsider", name: "Outsider", email: "o@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-b", userId: "owner-b", role: "owner" },
  ]);
  await db.insert(channel).values({
    id: "channel-b", tenantId: "tenant-b", wabaId: "201", phoneNumberId: "301", displayPhoneNumber: "+55 11 99999-0001",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" }, subscriptionFields: [],
  });
  await recordInboundTextMessage(db, (await resolveChannelPhoneNumber(db, "301"))!, {
    wamid: "wamid.B1", from: "5511900000001", profileName: "Ana", text: "Oi", sentAt: new Date("2026-10-20T09:00:00Z"),
  });
  const { conversations: [found] } = await callerFor({ userId: "owner-b", activeTenantId: null }).conversations.list({});
  conversationOfB = found.id;
  contactOfB = found.contact.id;
});

describe("tRPC router", () => {
  test("the sidebar reads only the authorized Tenant, including the first-membership fallback", async () => {
    expect(await callerFor(ownerA).tenancy.current()).toEqual({ id: "tenant-a", name: "Tenant A" });
    expect(await callerFor({ ...ownerA, activeTenantId: null }).tenancy.current())
      .toEqual({ id: "tenant-a", name: "Tenant A" });
    expect(await codeOf(callerFor({ ...ownerA, activeTenantId: "tenant-b" }).tenancy.current()))
      .toBe("FORBIDDEN");
    expect(await codeOf(callByPath(callerFor(ownerA), "tenancy.current", { tenantId: "tenant-b" })))
      .toBe("BAD_REQUEST");
  });

  test("realtime tokens grant only subscribe access to the Member's Tenant channel", async () => {
    const { channel, tokenRequest } = await callerFor(ownerA).realtime.token();

    expect(channel).toBe("tenant:tenant-a:inbox");
    expect(JSON.parse(tokenRequest.capability!)).toEqual({ "tenant:tenant-a:inbox": ["subscribe"] });
    expect(tokenRequest.clientId).toBeString();
    expect(tokenRequest.ttl).toBe(5 * 60 * 1000);
    expect(tokenRequest.mac).toBeString();
    expect(JSON.stringify(tokenRequest)).not.toContain("private-test-secret");
  });

  test("realtime refuses another Tenant and caller-supplied capabilities", async () => {
    const claimingB = callerFor({ userId: "owner-a", activeTenantId: "tenant-b" });
    expect(await codeOf(claimingB.realtime.token())).toBe("FORBIDDEN");
    for (const input of [{ tenantId: "tenant-b" }, { channel: "tenant:tenant-b:inbox" }, { capability: { "*": ["publish"] } }]) {
      expect(await codeOf(callByPath(callerFor(ownerA), "realtime.token", input))).toBe("BAD_REQUEST");
    }
  });

  test("every procedure refuses signed-out callers and users without a Tenant", async () => {
    const paths = Object.keys(appRouter._def.procedures);
    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      expect([path, await codeOf(callByPath(callerFor(null), path, {}))]).toEqual([path, "UNAUTHORIZED"]);
      expect([path, await codeOf(callByPath(callerFor({ userId: "outsider", activeTenantId: null }), path, {}))]).toEqual([path, "FORBIDDEN"]);
    }
  });

  test("the Tenant comes from membership, never from the session's claimed active Tenant", async () => {
    const claimingB = callerFor({ userId: "owner-a", activeTenantId: "tenant-b" });

    expect(await codeOf(claimingB.conversations.list({}))).toBe("FORBIDDEN");
  });

  test("another Tenant's Conversation or Contact is not found", async () => {
    const caller = callerFor(ownerA);

    expect(await caller.conversations.list({})).toEqual({ conversations: [], nextCursor: null });
    expect(await codeOf(caller.conversations.get({ conversationId: conversationOfB }))).toBe("NOT_FOUND");
    expect(await codeOf(caller.conversations.messages({ conversationId: conversationOfB }))).toBe("NOT_FOUND");
    expect(await codeOf(caller.contacts.rename({ contactId: contactOfB, name: "Invasor" }))).toBe("NOT_FOUND");
    expect(await codeOf(caller.replies.send({ conversationId: conversationOfB, text: "Invasão" }))).toBe("NOT_FOUND");
  });

  test("a Member reads and renames their own Tenant's Contacts", async () => {
    const caller = callerFor({ userId: "owner-b", activeTenantId: "tenant-b" });
    notifier.pings.length = 0;

    expect((await caller.conversations.messages({ conversationId: conversationOfB })).messages.map(({ text }) => text)).toEqual(["Oi"]);
    expect((await caller.contacts.rename({ contactId: contactOfB, name: "Ana Souza" })).name).toBe("Ana Souza");
    expect((await caller.conversations.get({ conversationId: conversationOfB })).contact.name).toBe("Ana Souza");
    expect(notifier.pings).toEqual([{ tenantId: "tenant-b", ping: { contactId: contactOfB } }]);
  });
});
