import { KnowledgeBaseManager } from "@/components/knowledge-base/knowledge-base-manager";
import { KnowledgeBasePage } from "@/components/knowledge-base/knowledge-base-page";
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
  if (scope.role === "owner")
    return (
      <KnowledgeBaseManager
        entries={entries}
        cap={cap}
        titleMaxLength={entryTitleMaxLength}
        save={saveKnowledgeEntryAction}
        remove={deleteKnowledgeEntryAction}
      />
    );

  return (
    <KnowledgeBasePage used={used} cap={cap}>
      <KnowledgeEntrySection kind="faq" entries={entries.filter(({ kind }) => kind === "faq")} />
      <KnowledgeEntrySection
        kind="section"
        entries={entries.filter(({ kind }) => kind === "section")}
      />
    </KnowledgeBasePage>
  );
}
