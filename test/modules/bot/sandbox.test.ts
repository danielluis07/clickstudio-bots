import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, contact, conversation, member, message, organization, user } from "@/db/schema";
import { createBotSandbox, createBotSettingsEditor } from "@/modules/bot";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { createConversationRepository, recordInboundTextMessage } from "@/modules/conversations";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { testBehaviour } from "@/test/support/bot";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestModel } from "@/test/support/model";
import { createBotModel } from "@/platform/ai-sdk-model";

let db: Database;
let owner: TenantScope;
const clock = createTestClock(new Date("2026-10-22T15:00:00Z"));
let model: ReturnType<typeof createTestModel>;

beforeEach(async () => {
  db = await createTestDatabase();
  model = createTestModel();
  clock.set(new Date("2026-10-22T15:00:00Z"));
  await db.insert(user).values({ id: "owner", name: "Ana", email: "ana@example.com" });
  await db.insert(organization).values({ id: "tenant", name: "Barbearia", slug: "barbearia" });
  await db.insert(member).values({ organizationId: "tenant", userId: "owner", role: "owner" });
  owner = (await resolveTenantScope(db, { userId: "owner" }))!;
});

afterEach(() => closeTestDatabase(db));

test.each([undefined, "test-direct-key"])(
  "a Gateway key enables sandbox replies through Anthropic (direct key: %s)",
  async (anthropicApiKey) => {
    await createBotSettingsEditor({ db, clock }).saveSettings(owner, testBehaviour);
    await createKnowledgeBaseEditor({ db, clock }).addEntry(owner, {
      kind: "faq",
      title: "Quanto custa o corte?",
      body: "O corte custa R$ 80.",
    });
    const network = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        content: [{ type: "text", text: "O corte custa R$ 80." }],
        finishReason: { unified: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5 },
        },
        warnings: [],
      }),
    );
    try {
      const configured = createBotModel({ gatewayApiKey: "test-gateway-key", anthropicApiKey });
      const sandbox = createBotSandbox({ db, clock, model: configured });
      expect(await sandbox.respond(owner, { text: "Qual o preço?", history: [] })).toMatchObject({
        ok: true,
        outcome: { kind: "answer", reply: "O corte custa R$ 80." },
        allowance: { used: 1, limit: 50 },
      });
      expect(network).toHaveBeenCalledTimes(1);
      const [url, init] = network.mock.calls[0];
      expect(String(url)).toBe("https://ai-gateway.vercel.sh/v4/ai/language-model");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-gateway-key");
      expect(headers.get("ai-language-model-id")).toBe("anthropic/claude-haiku-5.5");
      const body = JSON.parse(String(init?.body));
      expect(body.providerOptions).toEqual({ gateway: { only: ["anthropic"] } });
      expect(body.tools).toMatchObject([{ name: "handoff" }]);
      expect(body.prompt[0].content).toContain("Barbearia Navalha");
      expect(body.prompt[1]).toMatchObject({
        content: expect.stringContaining("O corte custa R$ 80."),
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      });
    } finally {
      network.mockRestore();
    }
  },
);

test("a failed Gateway request hands off without retrying the direct key or another provider", async () => {
  const network = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ error: { message: "Gateway temporarily unavailable" } }, { status: 503 }),
  );
  try {
    const sandbox = createBotSandbox({
      db,
      clock,
      model: createBotModel({
        gatewayApiKey: "test-gateway-key",
        anthropicApiKey: "test-direct-key",
      }),
    });
    expect(await sandbox.respond(owner, { text: "Oi", history: [] })).toMatchObject({
      ok: true,
      outcome: { kind: "handoff", reason: "bot_indisponivel" },
      allowance: { used: 1, limit: 50 },
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toBe(
      "https://ai-gateway.vercel.sh/v4/ai/language-model",
    );
  } finally {
    network.mockRestore();
  }
});

test("the direct Anthropic key still enables sandbox replies when no Gateway key is passed", async () => {
  const network = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: "Olá!" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  );
  try {
    const sandbox = createBotSandbox({
      db,
      clock,
      model: createBotModel({ anthropicApiKey: "test-direct-key" }),
    });
    expect(await sandbox.respond(owner, { text: "Oi", history: [] })).toMatchObject({
      ok: true,
      outcome: { kind: "answer", reply: "Olá!" },
    });
    expect(network).toHaveBeenCalledTimes(1);
    const [url, init] = network.mock.calls[0];
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("test-direct-key");
  } finally {
    network.mockRestore();
  }
});

test("the owner tests saved settings and Knowledge base through the Bot's Model contract before connecting a Channel", async () => {
  await createBotSettingsEditor({ db, clock }).saveSettings(owner, testBehaviour);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(owner, {
    kind: "faq",
    title: "Quanto custa o corte?",
    body: "O corte custa R$ 80.",
  });
  model.script({ text: "O corte custa R$ 80." });

  const sandbox = createBotSandbox({ db, clock, model });
  expect(
    await sandbox.respond(owner, { text: "Quanto custa o corte?", history: [] }),
  ).toMatchObject({
    ok: true,
    outcome: { kind: "answer", reply: "O corte custa R$ 80." },
    allowance: { used: 1, limit: 50 },
  });
  expect(model.requests[0]).toMatchObject({
    messages: [{ role: "user", text: "Quanto custa o corte?" }],
    tools: [expect.objectContaining({ name: "handoff" })],
  });
  expect(model.requests[0].instructions).toContain("Barbearia Navalha");
  expect(model.requests[0].knowledgeBase).toContain("O corte custa R$ 80.");
});

test("the next sandbox reply uses edited Knowledge base and settings while preserving the test's context", async () => {
  const knowledge = createKnowledgeBaseEditor({ db, clock });
  const added = await knowledge.addEntry(owner, {
    kind: "faq",
    title: "Quanto custa o corte?",
    body: "O corte custa R$ 80.",
  });
  if (!added.ok) throw new Error("expected saved FAQ");
  const sandbox = createBotSandbox({ db, clock, model });
  model.script({ text: "O corte custa R$ 80." }, { text: "Agora custa R$ 90." });
  await sandbox.respond(owner, { text: "Qual o preço?", history: [] });
  await knowledge.editEntry(owner, added.entryId, {
    title: "Quanto custa o corte?",
    body: "O corte custa R$ 90.",
  });
  await createBotSettingsEditor({ db, clock }).saveSettings(owner, {
    ...testBehaviour,
    businessName: "Novo nome",
  });

  expect(
    await sandbox.respond(owner, {
      text: "E agora?",
      history: [
        { author: "contact", text: "Qual o preço?" },
        { author: "bot", text: "O corte custa R$ 80." },
      ],
    }),
  ).toMatchObject({ ok: true, outcome: { kind: "answer", reply: "Agora custa R$ 90." } });
  expect(model.requests[1].instructions).toContain("Novo nome");
  expect(model.requests[1].knowledgeBase).toContain("O corte custa R$ 90.");
  expect(model.requests[1].knowledgeBase).not.toContain("R$ 80");
  expect(model.requests[1].messages).toEqual([
    { role: "user", text: "Qual o preço?" },
    { role: "assistant", text: "O corte custa R$ 80." },
    { role: "user", text: "E agora?" },
  ]);
});

test("50 attempts exhaust the Tenant's separate cap across service instances until midnight in São Paulo", async () => {
  clock.set(new Date("2026-10-23T02:59:59Z"));
  const sandbox = createBotSandbox({ db, clock, model });
  for (let turn = 0; turn < 50; turn++) {
    model.script({ text: "Olá!" });
    expect((await sandbox.respond(owner, { text: "Oi", history: [] })).ok).toBe(true);
  }
  const nextRequest = createBotSandbox({ db, clock, model });
  expect(await nextRequest.respond(owner, { text: "Oi", history: [] })).toEqual({
    ok: false,
    error: "daily_cap",
  });
  expect(model.requests).toHaveLength(50);
  expect(await nextRequest.status(owner)).toMatchObject({ allowance: { used: 50, limit: 50 } });
  clock.advance(1000);
  expect(await nextRequest.status(owner)).toMatchObject({ allowance: { used: 0, limit: 50 } });
  model.script({ text: "Bom dia!" });
  expect(await nextRequest.respond(owner, { text: "Oi", history: [] })).toMatchObject({
    ok: true,
    allowance: { used: 1, limit: 50 },
  });
});

test("a delayed prior-day reservation cannot roll back or reset the new day's allowance", async () => {
  const priorDayClock = createTestClock(new Date("2026-10-23T02:59:59Z"));
  const delayed = createBotSandbox({ db, clock: priorDayClock, model });
  clock.set(new Date("2026-10-23T03:00:00Z"));
  const current = createBotSandbox({ db, clock, model });
  model.script({ text: "Olá!" }, { text: "Olá!" });
  await current.respond(owner, { text: "Oi", history: [] });
  await delayed.respond(owner, { text: "Oi", history: [] });
  expect(await current.status(owner)).toMatchObject({ allowance: { used: 2, limit: 50 } });

  for (let turn = 0; turn < 48; turn++) {
    model.script({ text: "Olá!" });
    await current.respond(owner, { text: "Oi", history: [] });
  }
  expect(await delayed.respond(owner, { text: "Oi", history: [] })).toEqual({
    ok: false,
    error: "daily_cap",
  });
  expect(await current.status(owner)).toMatchObject({ allowance: { used: 50, limit: 50 } });
  expect(model.requests).toHaveLength(50);
});

test("sandbox Handoffs and refused capture/send calls make no network requests or changes to production Contacts, Conversations, messages or Channels", async () => {
  await db.insert(channel).values({
    id: "channel",
    tenantId: "tenant",
    wabaId: "201",
    phoneNumberId: "301",
    displayPhoneNumber: "+55 11 99999-0001",
    subscriptionFields: [],
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
  });
  await recordInboundTextMessage(db, (await resolveChannelPhoneNumber(db, "301"))!, {
    wamid: "wamid.production",
    from: "5511900000001",
    profileName: "Ana",
    text: "Mensagem real",
    sentAt: clock.now(),
  });
  const production = createConversationRepository(db, owner);
  const before = await production.listConversations({});
  const [{ id: contactId }] = await db.select({ id: contact.id }).from(contact);
  const snapshot = () =>
    Promise.all([
      db.select().from(contact),
      db.select().from(conversation),
      db.select().from(message),
      db.select().from(channel),
    ]);
  const savedRecords = await snapshot();
  const sandbox = createBotSandbox({ db, clock, model });
  model.script(
    { toolCalls: [{ id: "handoff", name: "handoff", input: { reason: "pedido_do_contato" } }] },
    {
      toolCalls: [
        { id: "capture", name: "capture_details", input: { contactId, name: "Nome de teste" } },
      ],
    },
    { toolCalls: [{ id: "send", name: "send_message", input: { contactId, text: "Invasão" } }] },
  );
  const network = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network request"),
  );
  try {
    expect(
      await sandbox.respond(owner, { text: "Quero falar com alguém", history: [] }),
    ).toMatchObject({
      ok: true,
      outcome: { kind: "handoff", reason: "pedido_do_contato" },
    });
    expect(await sandbox.respond(owner, { text: "Meu nome é Teste", history: [] })).toMatchObject({
      ok: true,
      outcome: { kind: "handoff", reason: "bot_indisponivel" },
    });
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
  expect(await production.listConversations({})).toEqual(before);
  expect(await snapshot()).toEqual(savedRecords);
  expect(await sandbox.status(owner)).toMatchObject({ allowance: { used: 2, limit: 50 } });
});

test("provider failures use the core's safe Handoff and still consume a sandbox attempt", async () => {
  const sandbox = createBotSandbox({ db, clock, model });
  model.script(new Error("Provider unavailable"));
  expect(await sandbox.respond(owner, { text: "Oi", history: [] })).toMatchObject({
    ok: true,
    outcome: { kind: "handoff", reason: "bot_indisponivel" },
    allowance: { used: 1, limit: 50 },
  });
});

test("invalid input and an unconfigured Model consume no sandbox allowance", async () => {
  const sandbox = createBotSandbox({ db, clock, model });
  for (const input of [
    { text: "  ", history: [] },
    { text: "a".repeat(4097), history: [] },
    {
      text: "Oi",
      history: Array.from({ length: 21 }, () => ({ author: "contact" as const, text: "Oi" })),
    },
    { text: "Oi", history: [], tenantId: "another-tenant" },
  ])
    expect(await sandbox.respond(owner, input)).toEqual({ ok: false, error: "invalid" });
  const unconfigured = createBotSandbox({ db, clock, model: createBotModel({}) });
  expect(await unconfigured.respond(owner, { text: "Oi", history: [] })).toEqual({
    ok: false,
    error: "unavailable",
  });
  expect(await unconfigured.status(owner)).toMatchObject({
    available: false,
    allowance: { used: 0, limit: 50 },
  });
  expect(model.requests).toEqual([]);
});
