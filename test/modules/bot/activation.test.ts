import { afterEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { createBotActivation, createBotSandbox, createBotSettingsEditor } from "@/modules/bot";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { testBehaviour } from "@/test/support/bot";
import { createTestModel } from "@/test/support/model";
import { member, user } from "@/db/schema";
import { resolveTenantScope } from "@/modules/tenancy";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
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
  await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
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
  await createBotSandbox({ db, clock, model }).respond(scope, { text: "Preço?", history: [] });
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
  await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  const model = createTestModel();
  model.script({ text: "R$ 80" });
  await createBotSandbox({ db, clock, model }).respond(scope, { text: "Preço?", history: [] });
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
  await createBotSettingsEditor({ db, clock }).saveSettings(scope, testBehaviour);
  await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
  });
  const model = createTestModel();
  model.script(new Error("provider unavailable"), { text: "R$ 80" });
  const sandbox = createBotSandbox({ db, clock, model });
  await sandbox.respond(scope, { text: "Preço?", history: [] });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
  await sandbox.respond(scope, { text: "Preço?", history: [] });
  clock.advance(1);
  await createBotSettingsEditor({ db, clock }).saveSettings(scope, {
    ...testBehaviour,
    businessName: "Novo nome",
  });
  expect(await activation.activate(scope)).toEqual({ ok: false, error: "incomplete" });
});
