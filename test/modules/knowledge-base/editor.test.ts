import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import { createBotCore } from "@/modules/bot";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import {
  createKnowledgeBaseEditor,
  readKnowledgeBase,
  type NewKnowledgeBaseEntry,
} from "@/modules/knowledge-base";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestBotRepository, createTestUsageMeter } from "@/test/support/bot";
import { createTestClock, type TestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestModel, type TestModel } from "@/test/support/model";

let db: Database;
let clock: TestClock;
let editor: ReturnType<typeof createKnowledgeBaseEditor>;
let ownerA: TenantScope;

const scopeOf = async (userId: string) => {
  const scope = await resolveTenantScope(db, { userId });
  if (!scope) throw new Error("expected a Tenant scope");
  return scope;
};

const added = async (input: NewKnowledgeBaseEntry, scope = ownerA) => {
  const result = await editor.addEntry(scope, input);
  if (!result.ok) throw new Error(`setup failed: ${result.error}`);
  return result.entryId;
};

afterEach(() => closeTestDatabase(db));

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createTestClock(new Date("2026-03-10T12:00:00.000Z"));
  editor = createKnowledgeBaseEditor({ db, clock });
  await db.insert(user).values([
    { id: "owner-a", name: "Dona Ana", email: "ana@a.example" },
    { id: "attendant-a", name: "Bruno Atendente", email: "bruno@a.example" },
    { id: "owner-b", name: "Dono Beto", email: "beto@b.example" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Barbearia A", slug: "a" },
    { id: "tenant-b", name: "Barbearia B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-a", userId: "attendant-a", role: "member" },
    { organizationId: "tenant-b", userId: "owner-b", role: "owner" },
  ]);
  ownerA = await scopeOf("owner-a");
});

describe("editing the Knowledge base", () => {
  test("the owner adds an FAQ pair and a titled section, each showing when and by whom it was saved", async () => {
    expect(
      await editor.addEntry(ownerA, {
        kind: "faq",
        title: "Quanto custa o corte?",
        body: "O corte custa R$ 80.",
      }),
    ).toMatchObject({ ok: true });
    clock.advance(60_000);
    expect(
      await editor.addEntry(ownerA, {
        kind: "section",
        title: "Pagamento",
        body: "Aceitamos PIX e cartão.",
      }),
    ).toMatchObject({ ok: true });

    const { entries } = await editor.getKnowledgeBase(ownerA);
    expect(entries).toEqual([
      {
        id: expect.any(String),
        kind: "faq",
        title: "Quanto custa o corte?",
        body: "O corte custa R$ 80.",
        updatedAt: new Date("2026-03-10T12:00:00.000Z"),
        updatedBy: "Dona Ana",
        size: 41,
      },
      {
        id: expect.any(String),
        kind: "section",
        title: "Pagamento",
        body: "Aceitamos PIX e cartão.",
        updatedAt: new Date("2026-03-10T12:01:00.000Z"),
        updatedBy: "Dona Ana",
        size: 32,
      },
    ]);
  });

  test("an edit replaces the entry's text and its last-edited time; a deletion removes it", async () => {
    const faq = await added({
      kind: "faq",
      title: "Quanto custa o corte?",
      body: "O corte custa R$ 80.",
    });
    const section = await added({ kind: "section", title: "Pagamento", body: "Aceitamos PIX." });
    clock.advance(5 * 60_000);

    expect(
      await editor.editEntry(ownerA, faq, {
        title: "Qual o preço do corte?",
        body: "O corte custa R$ 90.",
      }),
    ).toEqual({ ok: true });
    expect(await editor.deleteEntry(ownerA, section)).toEqual({ ok: true });

    expect((await editor.getKnowledgeBase(ownerA)).entries).toEqual([
      {
        id: faq,
        kind: "faq",
        title: "Qual o preço do corte?",
        body: "O corte custa R$ 90.",
        updatedAt: new Date("2026-03-10T12:05:00.000Z"),
        updatedBy: "Dona Ana",
        size: 42,
      },
    ]);
  });
});

describe("what the Bot reads", () => {
  const botFor = (model: TestModel) => {
    const repository = createTestBotRepository();
    repository.messages = [
      { author: "contact", text: "Quanto custa o corte?", sentAt: clock.now() },
    ];
    repository.getKnowledgeBase = (turn) => readKnowledgeBase(db, turn.scope);
    return createBotCore({ model, repository, meter: createTestUsageMeter(), clock });
  };

  test("the next reply after a save uses the saved Knowledge base of the turn's Tenant only", async () => {
    await db.insert(channel).values({
      id: "channel-a",
      tenantId: "tenant-a",
      wabaId: "201",
      phoneNumberId: "301",
      displayPhoneNumber: "+55 11 99999-0001",
      credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
      subscriptionFields: [],
    });
    const route = (await resolveChannelPhoneNumber(db, "301"))!;
    const model = createTestModel();
    model.script({ text: "R$ 80." }, { text: "R$ 90." }, { text: "R$ 90." });
    const faq = await added({
      kind: "faq",
      title: "Quanto custa o corte?",
      body: "O corte custa R$ 80.",
    });
    await added({ kind: "section", title: "Pagamento", body: "Aceitamos PIX." });
    await added(
      { kind: "faq", title: "Quanto custa a barba?", body: "A barba custa R$ 50." },
      await scopeOf("owner-b"),
    );

    await botFor(model).respond({ scope: route, conversationId: "conversation-a" });
    await editor.editEntry(ownerA, faq, {
      title: "Quanto custa o corte?",
      body: "O corte custa R$ 90.",
    });
    await botFor(model).respond({ scope: route, conversationId: "conversation-a" });
    await botFor(model).respond({ scope: ownerA, conversationId: "sandbox-a" });

    const [before, after, sandbox] = model.requests.map(({ knowledgeBase }) => knowledgeBase);
    expect(before).toBe(
      "# Knowledge base\n\n## Question: Quanto custa o corte?\nO corte custa R$ 80.\n\n## Pagamento\nAceitamos PIX.",
    );
    expect(after).toBe(
      "# Knowledge base\n\n## Question: Quanto custa o corte?\nO corte custa R$ 90.\n\n## Pagamento\nAceitamos PIX.",
    );
    expect(sandbox).toBe(after);
  });
});

describe("who may edit", () => {
  test("other Members read the Knowledge base but cannot add, edit or delete entries", async () => {
    const attendant = await scopeOf("attendant-a");
    const id = await added({ kind: "faq", title: "Abre?", body: "Sim." });

    expect(
      await editor.addEntry(attendant, { kind: "faq", title: "Fecha?", body: "Não." }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await editor.editEntry(attendant, id, { title: "Abre?", body: "Não." })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await editor.deleteEntry(attendant, id)).toEqual({ ok: false, error: "forbidden" });
    expect(await editor.getKnowledgeBase(attendant)).toMatchObject({
      entries: [{ id, body: "Sim." }],
      used: 9,
    });
  });
});

describe("Tenant isolation", () => {
  test("each Tenant reads, edits and deletes only its own entries, and its cap counts only them", async () => {
    const ownerB = await scopeOf("owner-b");
    const ofA = await added({ kind: "section", title: "Serviços", body: "x".repeat(29_992) });
    const ofB = await added({ kind: "faq", title: "Abre?", body: "Sim." }, ownerB);

    expect(await editor.editEntry(ownerA, ofB, { title: "Abre?", body: "Nunca." })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await editor.deleteEntry(ownerA, ofB)).toEqual({ ok: false, error: "not_found" });
    expect(
      await editor.addEntry(ownerB, { kind: "section", title: "Grande", body: "y".repeat(29_000) }),
    ).toMatchObject({ ok: true });

    expect(await editor.getKnowledgeBase(ownerA)).toMatchObject({
      entries: [{ id: ofA }],
      used: 30_000,
    });
    expect(await editor.getKnowledgeBase(ownerB)).toMatchObject({
      entries: [{ id: ofB, body: "Sim." }, { title: "Grande" }],
      used: 29_015,
    });
  });
});

describe("entry text", () => {
  test("is saved trimmed, with form line breaks counted once, and accents count as one character", async () => {
    await added({ kind: "section", title: "  Horário  ", body: "Seg a sex\r\nSáb\r\n" });

    expect(await editor.getKnowledgeBase(ownerA)).toMatchObject({
      entries: [{ title: "Horário", body: "Seg a sex\nSáb" }],
      used: 20,
    });
  });

  test("a blank title or body, a title over 200 characters or an unknown kind is refused", async () => {
    const id = await added({ kind: "faq", title: "Abre?", body: "Sim." });

    for (const input of [
      { kind: "faq", title: "   ", body: "Sim." },
      { kind: "section", title: "Pagamento", body: "\r\n " },
      { kind: "faq", title: "a".repeat(201), body: "Sim." },
      { kind: "price", title: "Corte", body: "R$ 80" },
    ]) {
      expect(await editor.addEntry(ownerA, input as NewKnowledgeBaseEntry)).toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect(await editor.editEntry(ownerA, id, { title: "Abre?", body: " " })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(
      await editor.addEntry(ownerA, { kind: "faq", title: "a".repeat(200), body: "Sim." }),
    ).toMatchObject({ ok: true });
    expect((await editor.getKnowledgeBase(ownerA)).entries.map(({ body }) => body)).toEqual([
      "Sim.",
      "Sim.",
    ]);
  });
});

describe("the 30,000-character allowance", () => {
  test("titles and bodies of every entry count toward it, up to exactly 30.000", async () => {
    await added({ kind: "faq", title: "a".repeat(100), body: "b".repeat(9_900) });
    await added({ kind: "section", title: "c".repeat(10), body: "d".repeat(19_990) });

    expect(await editor.getKnowledgeBase(ownerA)).toMatchObject({ used: 30_000, cap: 30_000 });
  });

  test("a new entry that would exceed it is refused and nothing is saved", async () => {
    await added({ kind: "section", title: "Serviços", body: "x".repeat(29_990) });

    expect(
      await editor.addEntry(ownerA, { kind: "faq", title: "Abre?", body: "Sim, abrimos." }),
    ).toEqual({ ok: false, error: "over_cap", size: 30_016 });
    expect(await editor.getKnowledgeBase(ownerA)).toMatchObject({ used: 29_998 });
  });

  test("an edit counts the entry's new text instead of its old text", async () => {
    const section = await added({ kind: "section", title: "Serviços", body: "x".repeat(20_000) });
    await added({ kind: "faq", title: "Abre?", body: "y".repeat(9_000) });

    expect(
      await editor.editEntry(ownerA, section, { title: "Serviços", body: "x".repeat(21_000) }),
    ).toEqual({ ok: false, error: "over_cap", size: 30_013 });
    expect(
      await editor.editEntry(ownerA, section, { title: "Serviços", body: "x".repeat(20_987) }),
    ).toEqual({ ok: true });
    expect(await editor.getKnowledgeBase(ownerA)).toMatchObject({ used: 30_000 });
  });
});
