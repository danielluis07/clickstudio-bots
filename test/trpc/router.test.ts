import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/db/database";
import { botReplyUsage, channel, member, organization, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import {
  createBotActivation,
  createBotAllowance,
  createBotSandbox,
  createBotSettingsEditor,
} from "@/modules/bot";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import {
  createContactDeletion,
  createConversationRepository,
  createHandoffControls,
  createReplyService,
  recordInboundTextMessage,
} from "@/modules/conversations";
import type { TRPCContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestWhatsAppSender } from "@/test/support/whatsapp-sender";
import { createAblyRealtime } from "@/platform/ably";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestModel } from "@/test/support/model";
import { createTestMailer } from "@/test/support/mailer";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTenantRepository } from "@/modules/tenancy";
import { testBehaviour } from "@/test/support/bot";

let db: Database;
let conversationOfB: string;
let contactOfB: string;
const notifier = createTestNotifier();
const sandboxModel = createTestModel();

const callerFor = (session: TRPCContext["session"], clock = createTestClock()) => {
  const activation = createBotActivation({ db, clock });
  return appRouter.createCaller({
    db,
    session,
    realtime: createAblyRealtime({ apiKey: "test.key:private-test-secret" }),
    notifier,
    activation,
    handoff: createHandoffControls({ db, clock, notifier }),
    deleteContact: createContactDeletion({ db, notifier, clock }),
    conversations: (scope) => createConversationRepository(db, scope),
    tenants: (scope) => createTenantRepository(db, scope),
    sandbox: createBotSandbox({ activation, db, clock, model: sandboxModel }),
    allowance: createBotAllowance({ db, clock, mailer: createTestMailer() }),
    replies: createReplyService({
      db,
      clock,
      notifier: createTestNotifier(),
      getSender: createTestWhatsAppSender,
    }),
  });
};
const ownerA = { userId: "owner-a", activeTenantId: "tenant-a" };
const blank = { name: "", email: "", city: "", need: "" };

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
  (
    path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], caller) as (
      input: unknown,
    ) => Promise<unknown>
  )(input);

afterAll(() => closeTestDatabase(db));

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner-a", name: "Owner A", email: "a@example.com" },
    { id: "owner-b", name: "Owner B", email: "b@example.com" },
    { id: "outsider", name: "Outsider", email: "o@example.com" },
    { id: "attendant", name: "Attendant", email: "attendant@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-b", userId: "owner-b", role: "owner" },
    { organizationId: "tenant-b", userId: "attendant", role: "member" },
  ]);
  await db.insert(channel).values({
    id: "channel-b",
    tenantId: "tenant-b",
    wabaId: "201",
    phoneNumberId: "301",
    displayPhoneNumber: "+55 11 99999-0001",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
    subscriptionFields: [],
  });
  await recordInboundTextMessage(db, (await resolveChannelPhoneNumber(db, "301"))!, {
    wamid: "wamid.B1",
    from: "5511900000001",
    profileName: "Ana",
    text: "Oi",
    sentAt: new Date("2026-10-20T09:00:00Z"),
  });
  const {
    conversations: [found],
  } = await callerFor({ userId: "owner-b", activeTenantId: null }).conversations.list({});
  conversationOfB = found.id;
  contactOfB = found.contact.id;
});

describe("tRPC router", () => {
  test("Bot activation and pause use the service clock from the context", async () => {
    const { scope, clock } = await seedLiveBot(db);
    const caller = callerFor({ userId: scope.userId, activeTenantId: scope.tenantId }, clock);
    await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
    await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
      kind: "faq",
      title: "Preço?",
      body: "R$ 80",
    });
    await createBotActivation({ db, clock }).markTested(scope, clock.now());
    expect(await caller.bot.activate()).toEqual({ ok: true });
    clock.advance(1234);
    expect(await caller.bot.setPaused({ paused: true })).toEqual({ ok: true });
    expect(await caller.bot.status()).toMatchObject({ enabled: true, paused: true });
    const [saved] = await db.select().from(channel).where(eq(channel.tenantId, scope.tenantId));
    expect(saved.updatedAt).toEqual(clock.now());
  });
  test("only an owner can read the current Tenant's reply usage without supplying a Tenant id", async () => {
    await db
      .insert(botReplyUsage)
      .values({ tenantId: "tenant-b", period: "2026-01-01", replies: 4444 });
    expect(await callerFor(ownerA).bot.usage()).toMatchObject({
      used: 0,
      limit: 5000,
      period: "2026-01-01",
    });
    expect(
      await callerFor({ userId: "owner-b", activeTenantId: "tenant-b" }).bot.usage(),
    ).toMatchObject({ used: 4444, warning: true });
    expect(
      await codeOf(callerFor({ userId: "attendant", activeTenantId: "tenant-b" }).bot.usage()),
    ).toBe("FORBIDDEN");
    expect(await codeOf(callByPath(callerFor(ownerA), "bot.usage", { tenantId: "tenant-b" }))).toBe(
      "BAD_REQUEST",
    );
  });
  test("only the owner can test the Bot, and sandbox requests cannot select a Tenant or production records", async () => {
    const attendant = callerFor({ userId: "attendant", activeTenantId: "tenant-b" });
    const input = { text: "Oi", history: [] };
    expect(await codeOf(attendant.sandbox.respond(input))).toBe("FORBIDDEN");
    expect(await codeOf(attendant.sandbox.status())).toBe("FORBIDDEN");
    expect(await callerFor(ownerA).sandbox.status()).toMatchObject({
      allowance: { used: 0, limit: 50 },
    });
    for (const extra of [
      { tenantId: "tenant-b" },
      { contactId: contactOfB },
      { conversationId: conversationOfB },
    ]) {
      expect(
        await codeOf(callByPath(callerFor(ownerA), "sandbox.respond", { ...input, ...extra })),
      ).toBe("BAD_REQUEST");
    }
    sandboxModel.script({ text: "Olá!" });
    expect(await callerFor(ownerA).sandbox.respond(input)).toMatchObject({
      outcome: { kind: "answer", reply: "Olá!" },
      allowance: { used: 1, limit: 50 },
    });
  });

  test("exhausting the daily sandbox cap returns a pt-BR message and leaves another Tenant's allowance untouched", async () => {
    const ownerB = callerFor({ userId: "owner-b", activeTenantId: "tenant-b" });
    for (let turn = 0; turn < 50; turn++) {
      sandboxModel.script({ text: "Olá!" });
      await ownerB.sandbox.respond({ text: "Oi", history: [] });
    }
    try {
      await ownerB.sandbox.respond({ text: "Oi", history: [] });
      throw new Error("expected daily cap refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect(error).toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message:
          "Você atingiu o limite diário de testes do Bot. Tente novamente amanhã, após a meia-noite no horário de São Paulo.",
      });
    }
    expect(await callerFor(ownerA).sandbox.status()).toMatchObject({
      allowance: { used: 1, limit: 50 },
    });
    sandboxModel.script({ text: "Ainda posso responder." });
    expect(await callerFor(ownerA).sandbox.respond({ text: "Oi", history: [] })).toMatchObject({
      allowance: { used: 2, limit: 50 },
    });
  });

  test("the sidebar reads only the authorized Tenant, including the first-membership fallback", async () => {
    expect(await callerFor(ownerA).tenancy.current()).toEqual({ id: "tenant-a", name: "Tenant A" });
    expect(await callerFor({ ...ownerA, activeTenantId: null }).tenancy.current()).toEqual({
      id: "tenant-a",
      name: "Tenant A",
    });
    expect(
      await codeOf(callerFor({ ...ownerA, activeTenantId: "tenant-b" }).tenancy.current()),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(callByPath(callerFor(ownerA), "tenancy.current", { tenantId: "tenant-b" })),
    ).toBe("BAD_REQUEST");
  });

  test("realtime tokens grant only subscribe access to the Member's Tenant channel", async () => {
    const { channel, tokenRequest } = await callerFor(ownerA).realtime.token();

    expect(channel).toBe("tenant:tenant-a:inbox");
    expect(JSON.parse(tokenRequest.capability!)).toEqual({
      "tenant:tenant-a:inbox": ["subscribe"],
    });
    expect(tokenRequest.clientId).toBeString();
    expect(tokenRequest.ttl).toBe(5 * 60 * 1000);
    expect(tokenRequest.mac).toBeString();
    expect(JSON.stringify(tokenRequest)).not.toContain("private-test-secret");
  });

  test("realtime refuses another Tenant and caller-supplied capabilities", async () => {
    const claimingB = callerFor({ userId: "owner-a", activeTenantId: "tenant-b" });
    expect(await codeOf(claimingB.realtime.token())).toBe("FORBIDDEN");
    for (const input of [
      { tenantId: "tenant-b" },
      { channel: "tenant:tenant-b:inbox" },
      { capability: { "*": ["publish"] } },
    ]) {
      expect(await codeOf(callByPath(callerFor(ownerA), "realtime.token", input))).toBe(
        "BAD_REQUEST",
      );
    }
  });

  test("every procedure refuses signed-out callers and users without a Tenant", async () => {
    const paths = Object.keys(appRouter._def.procedures);
    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      expect([path, await codeOf(callByPath(callerFor(null), path, {}))]).toEqual([
        path,
        "UNAUTHORIZED",
      ]);
      expect([
        path,
        await codeOf(callByPath(callerFor({ userId: "outsider", activeTenantId: null }), path, {})),
      ]).toEqual([path, "FORBIDDEN"]);
    }
  });

  test("the Tenant comes from membership, never from the session's claimed active Tenant", async () => {
    const claimingB = callerFor({ userId: "owner-a", activeTenantId: "tenant-b" });

    expect(await codeOf(claimingB.conversations.list({}))).toBe("FORBIDDEN");
  });

  test("another Tenant's Conversation or Contact is not found", async () => {
    const caller = callerFor(ownerA);

    expect(await caller.conversations.list({})).toEqual({ conversations: [], nextCursor: null });
    expect(await codeOf(caller.conversations.get({ conversationId: conversationOfB }))).toBe(
      "NOT_FOUND",
    );
    expect(await codeOf(caller.conversations.messages({ conversationId: conversationOfB }))).toBe(
      "NOT_FOUND",
    );
    expect(
      await codeOf(caller.contacts.update({ contactId: contactOfB, ...blank, name: "Invasor" })),
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(caller.replies.send({ conversationId: conversationOfB, text: "Invasão" })),
    ).toBe("NOT_FOUND");
  });

  test("a Member reads and edits their own Tenant's Contacts", async () => {
    const caller = callerFor({ userId: "owner-b", activeTenantId: "tenant-b" });
    notifier.pings.length = 0;

    expect(
      (await caller.conversations.messages({ conversationId: conversationOfB })).messages.map(
        ({ text }) => text,
      ),
    ).toEqual(["Oi"]);
    expect(
      await caller.contacts.update({
        contactId: contactOfB,
        ...blank,
        name: "Ana Souza",
        email: "ana@example.com",
      }),
    ).toMatchObject({ name: "Ana Souza", email: "ana@example.com" });
    expect(
      await codeOf(caller.contacts.update({ contactId: contactOfB, ...blank, email: "ana@" })),
    ).toBe("BAD_REQUEST");
    expect((await caller.conversations.get({ conversationId: conversationOfB })).contact.name).toBe(
      "Ana Souza",
    );
    expect(notifier.pings).toEqual([{ tenantId: "tenant-b", ping: { contactId: contactOfB } }]);
  });

  test("any Member uses the Handoff controls, which refuse another Tenant's Conversation", async () => {
    const input = { conversationId: conversationOfB };
    for (const path of ["handoff.takeOver", "handoff.returnToBot", "handoff.resolve"])
      expect([path, await codeOf(callByPath(callerFor(ownerA), path, input))]).toEqual([
        path,
        "NOT_FOUND",
      ]);
    const attendant = callerFor({ userId: "attendant", activeTenantId: "tenant-b" });
    const ownerB = callerFor({ userId: "owner-b", activeTenantId: "tenant-b" });
    const ownership = async () => {
      const { owner, handoffReason, waiting } = await ownerB.conversations.get(input);
      return { owner, handoffReason, waiting };
    };

    await ownerB.handoff.takeOver(input);
    expect(await ownership()).toEqual({ owner: "team", handoffReason: "assumida", waiting: true });
    expect(
      (await attendant.conversations.list({ waiting: true })).conversations.map(({ id }) => id),
    ).toEqual([conversationOfB]);
    await attendant.handoff.returnToBot(input);
    expect(await ownership()).toEqual({ owner: "bot", handoffReason: "assumida", waiting: true });
    await attendant.handoff.resolve(input);
    expect(await ownership()).toEqual({ owner: "bot", handoffReason: null, waiting: false });
    expect(await attendant.conversations.list({ waiting: true })).toEqual({
      conversations: [],
      nextCursor: null,
    });
  });

  test("bulk return authorizes Members, refuses foreign Conversations and bounds the selection", async () => {
    const input = { conversationIds: [conversationOfB] };
    expect(await codeOf(callerFor(ownerA).handoff.bulkReturnToBot(input))).toBe("NOT_FOUND");
    const attendant = callerFor({ userId: "attendant", activeTenantId: "tenant-b" });
    await attendant.handoff.takeOver({ conversationId: conversationOfB });
    expect(await codeOf(attendant.handoff.bulkReturnToBot(input))).toBe("OK");
    expect(await attendant.conversations.get({ conversationId: conversationOfB })).toMatchObject({
      owner: "bot",
      waiting: true,
      handoffReason: "assumida",
    });
    for (const conversationIds of [[], [""], Array(101).fill(conversationOfB)]) {
      expect(await codeOf(attendant.handoff.bulkReturnToBot({ conversationIds }))).toBe(
        "BAD_REQUEST",
      );
    }
    expect(
      await codeOf(
        callByPath(attendant, "handoff.bulkReturnToBot", {
          ...input,
          tenantId: "tenant-a",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  test("Contact deletion refuses non-owners and foreign Contacts, and authorizes the owner", async () => {
    const input = { contactId: contactOfB };
    expect(
      await codeOf(
        callerFor({ userId: "attendant", activeTenantId: "tenant-b" }).contacts.delete(input),
      ),
    ).toBe("FORBIDDEN");
    expect(await codeOf(callerFor(ownerA).contacts.delete(input))).toBe("NOT_FOUND");
    const ownerB = callerFor({ userId: "owner-b", activeTenantId: "tenant-b" });
    expect(await codeOf(ownerB.conversations.get({ conversationId: conversationOfB }))).toBe("OK");
    expect(await codeOf(ownerB.contacts.delete(input))).toBe("OK");
    expect(await codeOf(ownerB.conversations.get({ conversationId: conversationOfB }))).toBe(
      "NOT_FOUND",
    );
    expect(await codeOf(ownerB.conversations.messages({ conversationId: conversationOfB }))).toBe(
      "NOT_FOUND",
    );
  });
});
