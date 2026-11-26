import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
let editor: ReturnType<typeof createKnowledgeBaseEditor>;
let ownerA: TenantScope;

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../fixtures/knowledge-base/${name}`, import.meta.url)));

const scopeOf = async (userId: string) => {
  const scope = await resolveTenantScope(db, { userId });
  if (!scope) throw new Error("expected a Tenant scope");
  return scope;
};

afterEach(() => closeTestDatabase(db));

beforeEach(async () => {
  db = await createTestDatabase();
  editor = createKnowledgeBaseEditor({
    db,
    clock: createTestClock(new Date("2026-03-10T12:00:00.000Z")),
  });
  await db.insert(user).values([
    { id: "owner-a", name: "Dona Ana", email: "ana@a.example" },
    { id: "attendant-a", name: "Bruno Atendente", email: "bruno@a.example" },
  ]);
  await db.insert(organization).values({ id: "tenant-a", name: "Barbearia A", slug: "a" });
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-a", userId: "attendant-a", role: "member" },
  ]);
  ownerA = await scopeOf("owner-a");
});

describe("importing a file into the Knowledge base", () => {
  test("a TXT file becomes an editable Text section titled after the file", async () => {
    const result = await editor.importFile(ownerA, {
      name: "perguntas.txt",
      bytes: fixture("perguntas.txt"),
    });

    expect(result).toEqual({ ok: true, entryId: expect.any(String), title: "perguntas" });
    expect((await editor.getKnowledgeBase(ownerA)).entries).toEqual([
      {
        id: expect.any(String),
        kind: "section",
        title: "perguntas",
        body: "Onde ficamos\nRua das Flores, 120 — Centro.\n\nTem estacionamento? Sim, gratuito.",
        updatedAt: new Date("2026-03-10T12:00:00.000Z"),
        updatedBy: "Dona Ana",
        size: 87,
      },
    ]);
  });

  test("a PDF's and a DOCX's text become Text sections, line by line and paragraph by paragraph", async () => {
    expect(
      await editor.importFile(ownerA, { name: "Serviços.PDF", bytes: fixture("servicos.pdf") }),
    ).toMatchObject({ ok: true, title: "Serviços" });
    expect(
      await editor.importFile(ownerA, { name: "politicas.docx", bytes: fixture("politicas.docx") }),
    ).toMatchObject({ ok: true, title: "politicas" });

    expect(
      (await editor.getKnowledgeBase(ownerA)).entries.map(({ kind, title, body }) => ({
        kind,
        title,
        body,
      })),
    ).toEqual([
      {
        kind: "section",
        title: "Serviços",
        body: "Horário de funcionamento\nAtendemos de segunda a sábado, das 9h às 19h.\nAceitamos PIX e cartão.",
      },
      {
        kind: "section",
        title: "politicas",
        body: "Política de cancelamento\n\nCancelamentos com até 24 horas de antecedência não têm custo.\n\nFaltas sem aviso pagam 50% do valor do serviço.",
      },
    ]);
  });

  test("a TXT saved by Windows in ANSI or UTF-16 keeps its accents", async () => {
    // "Horário: até às 19h" in Windows-1252, and in UTF-16 LE with its BOM.
    const ansi = new Uint8Array([
      0x48, 0x6f, 0x72, 0xe1, 0x72, 0x69, 0x6f, 0x3a, 0x20, 0x61, 0x74, 0xe9, 0x20, 0xe0, 0x73,
      0x20, 0x31, 0x39, 0x68,
    ]);
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...ansi].flatMap((byte) => [byte, 0x00])]);

    await editor.importFile(ownerA, { name: "ansi.txt", bytes: ansi });
    await editor.importFile(ownerA, { name: "unicode.txt", bytes: utf16 });

    expect((await editor.getKnowledgeBase(ownerA)).entries.map(({ body }) => body)).toEqual([
      "Horário: até às 19h",
      "Horário: até às 19h",
    ]);
  });

  test("a file name too long for a title is shortened, and one with no name gets a stand-in", async () => {
    const bytes = fixture("perguntas.txt");
    const long = await editor.importFile(ownerA, { name: `${"á".repeat(250)}.txt`, bytes });
    const unnamed = await editor.importFile(ownerA, { name: " .txt", bytes });

    expect([long, unnamed]).toEqual([
      { ok: true, entryId: expect.any(String), title: "á".repeat(200) },
      { ok: true, entryId: expect.any(String), title: "Arquivo importado" },
    ]);
  });

  test("only the owner imports; other Members are refused", async () => {
    const attendant = await scopeOf("attendant-a");

    expect(
      await editor.importFile(attendant, {
        name: "perguntas.txt",
        bytes: fixture("perguntas.txt"),
      }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect((await editor.getKnowledgeBase(ownerA)).entries).toEqual([]);
  });
});

describe("files the import refuses, saving nothing", () => {
  const expectNothingSaved = async () =>
    expect((await editor.getKnowledgeBase(ownerA)).entries).toEqual([]);

  test("a scanned or image-only PDF, which has no text to read", async () => {
    expect(
      await editor.importFile(ownerA, {
        name: "digitalizado.pdf",
        bytes: fixture("digitalizado.pdf"),
      }),
    ).toEqual({ ok: false, error: "no_text" });
    await expectNothingSaved();
  });

  test("a file over 4 MB, even one whose text would fit", async () => {
    const megabytes = (count: number) => count * 1024 * 1024;
    const padded = new Uint8Array(megabytes(4) + 1).fill(0x20);
    padded.set(new TextEncoder().encode("Horário"));

    expect(await editor.importFile(ownerA, { name: "grande.txt", bytes: padded })).toEqual({
      ok: false,
      error: "too_large",
    });
    await expectNothingSaved();
    expect(
      await editor.importFile(ownerA, { name: "limite.txt", bytes: padded.subarray(1) }),
    ).toMatchObject({ ok: true });
  });

  test("text that would take the Knowledge base over 30.000 characters, counting what is saved", async () => {
    await editor.addEntry(ownerA, { kind: "section", title: "Preços", body: "a".repeat(29_900) });
    const text = new TextEncoder().encode("b".repeat(91));

    expect(await editor.importFile(ownerA, { name: "extra.txt", bytes: text })).toEqual({
      ok: false,
      error: "over_cap",
      size: 30_002,
      sectionSize: 96,
    });
    expect((await editor.getKnowledgeBase(ownerA)).entries).toHaveLength(1);
    expect(
      await editor.importFile(ownerA, { name: "extra.txt", bytes: text.subarray(2) }),
    ).toMatchObject({ ok: true });
  });

  test("a file whose text alone is over 30.000 characters", async () => {
    expect(
      await editor.importFile(ownerA, {
        name: "manual.txt",
        bytes: new TextEncoder().encode("é".repeat(30_001)),
      }),
    ).toEqual({ ok: false, error: "over_cap", size: 30_007, sectionSize: 30_007 });
    await expectNothingSaved();
  });

  test("a damaged PDF or DOCX, or a file renamed to look like one", async () => {
    const damaged = fixture("servicos.pdf").subarray(0, 200);
    const plainText = new TextEncoder().encode("Não sou um documento do Word.");

    for (const file of [
      { name: "servicos.pdf", bytes: damaged },
      { name: "politicas.docx", bytes: plainText },
      { name: "politicas.docx", bytes: fixture("servicos.pdf") },
      { name: "politicas.txt", bytes: fixture("politicas.docx") },
    ])
      expect(await editor.importFile(ownerA, file)).toEqual({ ok: false, error: "unreadable" });
    await expectNothingSaved();
  });

  test("any type other than PDF, DOCX or TXT", async () => {
    for (const name of ["foto.jpg", "planilha.xlsx", "antigo.doc", "sem-extensao"])
      expect(await editor.importFile(ownerA, { name, bytes: fixture("perguntas.txt") })).toEqual({
        ok: false,
        error: "unsupported",
      });
    await expectNothingSaved();
  });
});
