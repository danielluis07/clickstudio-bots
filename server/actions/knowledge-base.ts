"use server";

import { refresh } from "next/cache";
import { entryTitleMaxLength, knowledgeBaseCharacterCap, type KnowledgeEntryKind } from "@/modules/knowledge-base";
import { formatCount } from "@/lib/format";
import { formText, type FormState } from "@/server/actions/form-state";
import { requireTenantScope } from "@/server/auth/guards";
import { knowledgeBaseEditor } from "@/server/services";

// The knowledge-base module re-checks that the actor is the Tenant's owner
// and that the save fits the cap.

const saveErrorMessages = {
  forbidden: "Apenas o responsável pelo negócio pode alterar a base de conhecimento.",
  invalid: `Preencha os dois campos. O título ou a pergunta pode ter até ${entryTitleMaxLength} caracteres.`,
  not_found: "Este item não existe mais. Atualize a página.",
} as const;

type SaveResult = Awaited<ReturnType<typeof knowledgeBaseEditor.addEntry | typeof knowledgeBaseEditor.editEntry>>;

const saveMessage = (result: SaveResult): FormState => {
  if (result.ok) return { status: "success", message: "Salvo. O Bot já usa esta versão na próxima resposta." };
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

export async function deleteKnowledgeEntryAction(entryId: string) {
  const scope = await requireTenantScope();
  await knowledgeBaseEditor.deleteEntry(scope, entryId);
  refresh();
}
