import { KnowledgeBaseAllowance } from "@/components/knowledge-base/knowledge-base-allowance";
import { KnowledgeEntrySection } from "@/components/knowledge-base/knowledge-entry-section";
import { entryTitleMaxLength } from "@/modules/knowledge-base";
import type { TenantScope } from "@/modules/tenancy";
import { knowledgeBaseEditor } from "@/server/services";

export async function KnowledgeBaseEditor({ scope }: { scope: TenantScope }) {
  const { entries, used, cap } = await knowledgeBaseEditor.getKnowledgeBase(scope);
  // Hiding the controls is not the authorization: the module re-checks.
  const canEdit = scope.role === "owner";
  const sectionProps = { used, cap, titleMaxLength: entryTitleMaxLength, canEdit };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Base de conhecimento</h1>
          <p className="text-muted-foreground">
            O Bot responde aos Contatos somente com o que estiver aqui. As alterações salvas valem a partir da próxima resposta, inclusive nas conversas em andamento.
          </p>
        </div>
        <KnowledgeBaseAllowance used={used} cap={cap} />
      </div>
      <KnowledgeEntrySection kind="faq" entries={entries.filter(({ kind }) => kind === "faq")} {...sectionProps} />
      <KnowledgeEntrySection kind="section" entries={entries.filter(({ kind }) => kind === "section")} {...sectionProps} />
    </div>
  );
}
