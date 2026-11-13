import { afterEach, expect, spyOn, test } from "bun:test";
import type { Database } from "@/db/database";
import { createBotActivation, createBotSandbox, createBotSettingsEditor } from "@/modules/bot";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { saveTestSettings, testBotSettings } from "@/test/support/bot";
import { createTestModel } from "@/test/support/model";
import { botActivation, channel, member, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveTenantScope } from "@/modules/tenancy";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

test("a serialization retry checks readiness again after rolling back the flag write", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  const settings = createBotSettingsEditor({ db, clock });
  await saveTestSettings(settings, scope, testBotSettings);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  await activation.markTested(scope, clock.now());
  const transaction = db.transaction.bind(db);
  const conflict = Object.assign(new Error("Concurrent Channel update"), { code: "40001" });
  let attempts = 0;
  const transactions = spyOn(db, "transaction").mockImplementation(async (run, config) => {
    // Only activation's snapshot counts; the settings save is a transaction too.
    if (config?.isolationLevel !== "repeatable read") return transaction(run, config);
    attempts++;
    if (attempts !== 1) return transaction(run, config);
    try {
      return await transaction(async (tx) => {
        const result: unknown = await run(tx);
        expect(result).toEqual({ ok: true });
        throw new Error("Query failed", { cause: conflict });
      }, config);
    } finally {
      clock.advance(1);
      await saveTestSettings(settings, scope, { ...testBotSettings, businessName: "Novo nome" });
    }
  });
  try {
    expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
    expect(attempts).toBe(2);
  } finally {
    transactions.mockRestore();
  }
  expect(await activation.status(scope)).toMatchObject({ tested: false, enabled: false });
});

test("activation retries serialization failures at most twice and propagates other database failures", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  const conflict = Object.assign(new Error("Concurrent Channel update"), { code: "40001" });
  const transactions = spyOn(db, "transaction").mockRejectedValue(conflict);
  try {
    await expect(activation.activate(scope)).rejects.toBe(conflict);
    expect(transactions).toHaveBeenCalledTimes(3);
    transactions.mockClear();
    const unavailable = new Error("Database unavailable");
    transactions.mockRejectedValue(unavailable);
    await expect(activation.activate(scope)).rejects.toBe(unavailable);
    expect(transactions).toHaveBeenCalledTimes(1);
  } finally {
    transactions.mockRestore();
  }
});

test("tested marks are owner-only, Tenant-scoped and never move backward", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const other = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  await db.insert(user).values({ id: "attendant", name: "Member", email: "member@example.com" });
  await db
    .insert(member)
    .values({ userId: "attendant", organizationId: scope.tenantId, role: "member" });
  const attendant = (await resolveTenantScope(db, { userId: "attendant" }))!;
  expect(await activation.markTested(attendant, clock.now())).toEqual({
    ok: false,
    error: "forbidden",
  });
  expect(await db.select().from(botActivation)).toEqual([]);
  const earlier = clock.now();
  clock.advance(1000);
  const latest = clock.now();
  await activation.markTested(scope, latest);
  await activation.markTested(scope, earlier);
  expect(await db.select().from(botActivation)).toEqual([
    { tenantId: scope.tenantId, testedAt: latest },
  ]);
  expect(await activation.status(other.scope)).toMatchObject({ tested: false });
});

test("Knowledge base edits require another test and a disconnected Channel cannot activate", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  const knowledge = createKnowledgeBaseEditor({ db, clock });
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, testBotSettings);
  const entry = await knowledge.addEntry(scope, { kind: "faq", title: "Preço?", body: "R$ 80" });
  if (!entry.ok) throw new Error("Expected a saved entry");
  await activation.markTested(scope, clock.now());
  clock.advance(1);
  await knowledge.editEntry(scope, entry.entryId, { title: "Preço?", body: "R$ 90" });
  expect(await activation.status(scope)).toMatchObject({ knowledge: true, tested: false });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
  await activation.markTested(scope, clock.now());
  await db
    .update(channel)
    .set({ subscriptionStatus: "failed" })
    .where(eq(channel.tenantId, scope.tenantId));
  expect(await activation.status(scope)).toMatchObject({ tested: true, connected: false });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
  await db
    .update(channel)
    .set({ subscriptionStatus: "subscribed" })
    .where(eq(channel.tenantId, scope.tenantId));
  await knowledge.deleteEntry(scope, entry.entryId);
  expect(await activation.status(scope)).toMatchObject({ knowledge: false });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
});

test("an edit during a sandbox turn still requires a test of the saved change", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  const settings = createBotSettingsEditor({ db, clock });
  await saveTestSettings(settings, scope, testBotSettings);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  const scripted = createTestModel();
  scripted.script({ text: "R$ 80" });
  const model = {
    generate: async (request: Parameters<typeof scripted.generate>[0]) => {
      clock.advance(1000);
      await saveTestSettings(settings, scope, { ...testBotSettings, businessName: "Novo nome" });
      return scripted.generate(request);
    },
  };
  const result = await createBotSandbox({ db, clock, model, activation }).respond(scope, {
    text: "Preço?",
    history: [],
  });
  expect(result).toMatchObject({ ok: true, outcome: { kind: "answer" } });
  expect(await activation.status(scope)).toMatchObject({ tested: false });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
});

test("activation requires a saved business profile, Knowledge base and successful sandbox test, in order", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
  expect(await activation.status(scope)).toMatchObject({
    profile: false,
    knowledge: false,
    tested: false,
    enabled: false,
  });
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, testBotSettings);
  clock.advance(1);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
  const model = createTestModel();
  model.script({ text: "O corte custa R$ 80." });
  clock.advance(1);
  await createBotSandbox({
    activation: createBotActivation({ db, clock }),
    db,
    clock,
    model,
  }).respond(scope, { text: "Preço?", history: [] });
  expect(await activation.activate(scope)).toEqual({ ok: true });
  expect(await activation.status(scope)).toMatchObject({
    profile: true,
    knowledge: true,
    tested: true,
    enabled: true,
    paused: false,
  });
});

test("Members can pause only their activated Channel and cannot activate the Bot", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  await db.insert(user).values({ id: "attendant", name: "Member", email: "member@example.com" });
  await db
    .insert(member)
    .values({ userId: "attendant", organizationId: scope.tenantId, role: "member" });
  const attendant = (await resolveTenantScope(db, { userId: "attendant" }))!;
  const activation = createBotActivation({ db, clock });
  expect(await activation.activate(attendant)).toEqual({ ok: false, error: "forbidden" });
  expect(await activation.setPaused(attendant, true)).toEqual({ ok: false, error: "inactive" });
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, testBotSettings);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  const model = createTestModel();
  model.script({ text: "R$ 80" });
  await createBotSandbox({
    activation: createBotActivation({ db, clock }),
    db,
    clock,
    model,
  }).respond(scope, { text: "Preço?", history: [] });
  await activation.activate(scope);
  expect(await activation.setPaused(attendant, true)).toEqual({ ok: true });
  expect(await activation.status(scope)).toMatchObject({ paused: true, enabled: true });
  const other = await seedLiveBot(db);
  expect(await activation.status(other.scope)).toMatchObject({ paused: false, enabled: false });
  expect(await activation.setPaused(other.scope, false)).toEqual({ ok: false, error: "inactive" });
});

test("provider failures do not complete testing and settings edits require a new pre-activation test", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, testBotSettings);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  const model = createTestModel();
  model.script(new Error("provider unavailable"), { text: "R$ 80" });
  const sandbox = createBotSandbox({
    activation: createBotActivation({ db, clock }),
    db,
    clock,
    model,
  });
  await sandbox.respond(scope, { text: "Preço?", history: [] });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
  await sandbox.respond(scope, { text: "Preço?", history: [] });
  clock.advance(1);
  await saveTestSettings(createBotSettingsEditor({ db, clock }), scope, {
    ...testBotSettings,
    businessName: "Novo nome",
  });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
});

test("the profile step is done only once the Business profile itself is saved", async () => {
  db = await createTestDatabase();
  const { scope, clock } = await seedLiveBot(db);
  const activation = createBotActivation({ db, clock });
  const settings = createBotSettingsEditor({ db, clock });
  const { businessName, offer, address, hours, ...behaviour } = testBotSettings;

  await settings.saveBehaviour(scope, behaviour);
  expect(await activation.status(scope)).toMatchObject({ profile: false });

  await settings.saveProfile(scope, { businessName, offer, address, hours });
  expect(await activation.status(scope)).toMatchObject({ profile: true });
});
