import { KnowledgeBaseAllowance } from "@/components/knowledge-base/knowledge-base-allowance";
import { KnowledgeBaseManager } from "@/components/knowledge-base/knowledge-base-manager";
import { KnowledgeEntrySection } from "@/components/knowledge-base/knowledge-entry-section";
import { entryTitleMaxLength } from "@/modules/knowledge-base";
import type { TenantScope } from "@/modules/tenancy";
import { knowledgeBaseEditor } from "@/server/services";
import {
  deleteKnowledgeEntryAction,
  saveKnowledgeEntryAction,
} from "@/server/actions/knowledge-base";

export async function KnowledgeBaseEditor({ scope }: { scope: TenantScope }) {
  const { entries, used, cap } = await knowledgeBaseEditor.getKnowledgeBase(scope);
  // Hiding the controls is not the authorization: the module re-checks.
  const canEdit = scope.role === "owner";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Base de conhecimento</h1>
          <p className="text-muted-foreground">
            O Bot responde aos Contatos somente com o que estiver aqui. As alterações salvas valem a
            partir da próxima resposta, inclusive nas conversas em andamento.
          </p>
        </div>
      </div>
      {canEdit ? (
        <KnowledgeBaseManager
          entries={entries}
          cap={cap}
          titleMaxLength={entryTitleMaxLength}
          save={saveKnowledgeEntryAction}
          remove={deleteKnowledgeEntryAction}
        />
      ) : (
        <>
          <KnowledgeBaseAllowance used={used} cap={cap} />
          <KnowledgeEntrySection
            kind="faq"
            entries={entries.filter(({ kind }) => kind === "faq")}
          />
          <KnowledgeEntrySection
            kind="section"
            entries={entries.filter(({ kind }) => kind === "section")}
          />
        </>
      )}
    </div>
  );
}
