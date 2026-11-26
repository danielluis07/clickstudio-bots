// Run in a separate Bun process so these module mocks cannot affect other tests.
import { mock } from "bun:test";
import { deepStrictEqual } from "node:assert/strict";

type ImportResult =
  | { ok: true; entryId: string; title: string }
  | { ok: false; error: string; size?: number; sectionSize?: number };

const scope = { tenantId: "tenant-a", memberId: "member-a", role: "owner" };
let result: ImportResult = { ok: true, entryId: "entry-1", title: "Serviços" };
const received: unknown[] = [];
let refreshes = 0;

mock.module("next/cache", () => ({ refresh: () => refreshes++ }));
mock.module("@/server/auth/guards", () => ({ requireTenantScope: async () => scope }));
mock.module("@/server/services", () => ({
  knowledgeBaseEditor: {
    importFile: async (...args: unknown[]) => {
      received.push(args);
      return result;
    },
  },
}));

const { importKnowledgeFileAction } = await import("@/server/actions/knowledge-base");

const upload = (file?: File) => {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return importKnowledgeFileAction({ status: "idle" }, formData);
};

// The uploaded file reaches the module as its name and bytes, and the page refreshes.
deepStrictEqual(await upload(new File([new Uint8Array([1, 2, 3])], "Serviços.pdf")), {
  status: "success",
  message:
    "Arquivo importado como a seção “Serviços”. Revise o texto: o Bot já usa esta seção na próxima resposta.",
});
deepStrictEqual(received, [[scope, { name: "Serviços.pdf", bytes: new Uint8Array([1, 2, 3]) }]]);
deepStrictEqual(refreshes, 1);
console.log("import success passed");

const pasteInstead = "Se preferir, copie o texto do arquivo e cole em uma nova seção.";
const refusals: [ImportResult, string][] = [
  [
    { ok: false, error: "no_text" },
    `Não encontramos texto neste arquivo. PDFs digitalizados ou feitos de imagens não podem ser lidos. ${pasteInstead}`,
  ],
  [
    { ok: false, error: "unreadable" },
    `Não conseguimos ler este arquivo. Ele pode estar danificado ou protegido por senha. ${pasteInstead}`,
  ],
  [
    { ok: false, error: "too_large" },
    `O arquivo tem mais de 4 MB, o tamanho máximo para importar. ${pasteInstead}`,
  ],
  [{ ok: false, error: "unsupported" }, "Envie um arquivo PDF, DOCX ou TXT."],
  [
    { ok: false, error: "over_cap", size: 31_250, sectionSize: 1_250 },
    `Com o texto deste arquivo, a base de conhecimento ficaria com 31.250 caracteres, acima do limite de 30.000. Remova outros itens ou cole apenas o trecho necessário em uma nova seção.`,
  ],
  [
    { ok: false, error: "over_cap", size: 30_007, sectionSize: 30_007 },
    "O texto deste arquivo tem 30.007 caracteres, mais que o limite de 30.000 de toda a base de conhecimento. Copie apenas os trechos necessários e cole em uma nova seção.",
  ],
  [
    { ok: false, error: "forbidden" },
    "Apenas o responsável pelo negócio pode alterar a base de conhecimento.",
  ],
];
for (const [refusal, message] of refusals) {
  result = refusal;
  deepStrictEqual(await upload(new File(["x"], "arquivo.pdf")), { status: "error", message });
}
deepStrictEqual(refreshes, 1);
console.log(`${refusals.length} import refusal messages passed`);

// A request without a file never reaches the module.
received.length = 0;
deepStrictEqual(await upload(), { status: "error", message: "Escolha um arquivo para importar." });
deepStrictEqual(received, []);
console.log("missing file passed");
