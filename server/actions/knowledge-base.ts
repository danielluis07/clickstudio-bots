"use server";

import { refresh } from "next/cache";
import {
  entryTitleMaxLength,
  importFileTooLargeMessage,
  knowledgeBaseCharacterCap,
  pasteTextInstead,
  type KnowledgeEntryKind,
} from "@/modules/knowledge-base";
import { formatCount } from "@/platform/format";
import { formText, type FormState } from "@/server/actions/form-state";
import { toFormState } from "@/server/actions/to-form-state";
import { requireTenantScope } from "@/server/auth/guards";
import { knowledgeBaseEditor } from "@/server/services";

// The knowledge-base module re-checks that the actor is the Tenant's owner
// and that the save fits the cap.

const saveErrorMessages = {
  forbidden: "Apenas o responsável pelo negócio pode alterar a base de conhecimento.",
  invalid: `Preencha os dois campos. O título ou a pergunta pode ter até ${entryTitleMaxLength} caracteres.`,
  not_found: "Este item não existe mais. Atualize a página.",
} as const;

type SaveResult = Awaited<
  ReturnType<typeof knowledgeBaseEditor.addEntry | typeof knowledgeBaseEditor.editEntry>
>;

const saveMessage = (result: SaveResult): FormState => {
  if (result.ok)
    return { status: "success", message: "Salvo. O Bot já usa esta versão na próxima resposta." };
  if (result.error === "over_cap") {
    return {
      status: "error",
      message: `A base de conhecimento ficaria com ${formatCount(result.size)} caracteres, acima do limite de ${formatCount(knowledgeBaseCharacterCap)}. Encurte o texto ou remova outros itens.`,
    };
  }
  return { status: "error", message: saveErrorMessages[result.error] };
};

// Adds an entry, or edits the one named by the form's `entryId`.
export async function saveKnowledgeEntryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const scope = await requireTenantScope();
  const text = { title: formText(formData, "title"), body: formText(formData, "body") };
  const entryId = formText(formData, "entryId");

  const result = entryId
    ? await knowledgeBaseEditor.editEntry(scope, entryId, text)
    : await knowledgeBaseEditor.addEntry(scope, {
        ...text,
        // The module refuses any other kind.
        kind: formText(formData, "kind") as KnowledgeEntryKind,
      });
  if (result.ok) refresh();
  return saveMessage(result);
}

export async function deleteKnowledgeEntryAction(entryId: string): Promise<FormState> {
  const scope = await requireTenantScope();
  const result = await knowledgeBaseEditor.deleteEntry(scope, entryId);
  return toFormState(result, saveErrorMessages, "Item excluído da base de conhecimento.");
}

const importErrorMessages = {
  forbidden: saveErrorMessages.forbidden,
  no_text: `Não encontramos texto neste arquivo. PDFs digitalizados ou feitos de imagens não podem ser lidos. ${pasteTextInstead}`,
  unreadable: `Não conseguimos ler este arquivo. Ele pode estar danificado ou protegido por senha. ${pasteTextInstead}`,
  too_large: importFileTooLargeMessage,
  unsupported: "Envie um arquivo PDF, DOCX ou TXT.",
} as const;

// Adds the text of the form's `file` as a new Text section. The file itself
// is read in memory and discarded.
export async function importKnowledgeFileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const scope = await requireTenantScope();
  const file = formData.get("file");
  if (!(file instanceof File))
    return { status: "error", message: "Escolha um arquivo para importar." };

  const result = await knowledgeBaseEditor.importFile(scope, {
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (result.ok) {
    refresh();
    return {
      status: "success",
      message: `Arquivo importado como a seção “${result.title}”. Revise o texto: o Bot já usa esta seção na próxima resposta.`,
    };
  }
  if (result.error === "over_cap") {
    if (result.sectionSize > knowledgeBaseCharacterCap)
      return {
        status: "error",
        message: `O texto deste arquivo tem ${formatCount(result.sectionSize)} caracteres, mais que o limite de ${formatCount(knowledgeBaseCharacterCap)} de toda a base de conhecimento. Copie apenas os trechos necessários e cole em uma nova seção.`,
      };
    return {
      status: "error",
      message: `Com o texto deste arquivo, a base de conhecimento ficaria com ${formatCount(result.size)} caracteres, acima do limite de ${formatCount(knowledgeBaseCharacterCap)}. Remova outros itens ou cole apenas o trecho necessário em uma nova seção.`,
    };
  }
  return { status: "error", message: importErrorMessages[result.error] };
}
