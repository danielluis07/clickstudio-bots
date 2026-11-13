import { DashboardPage } from "@/components/dashboard/dashboard-page";
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
    <DashboardPage
      title="Base de conhecimento"
      description={
        <p>
          O Bot responde aos Contatos somente com o que estiver aqui. As alterações salvas valem a
          partir da próxima resposta, inclusive nas conversas em andamento.
        </p>
      }
    >
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
    </DashboardPage>
  );
}
