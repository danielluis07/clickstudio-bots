import { KnowledgeBaseManager } from "@/components/knowledge-base/knowledge-base-manager";
import { KnowledgeBasePage } from "@/components/knowledge-base/knowledge-base-page";
import { KnowledgeEntrySection } from "@/components/knowledge-base/knowledge-entry-section";
import { entryTitleMaxLength } from "@/modules/knowledge-base";
import { isOwner, type TenantScope } from "@/modules/tenancy";
import { knowledgeBaseEditor } from "@/server/services";
import {
  deleteKnowledgeEntryAction,
  importKnowledgeFileAction,
  saveKnowledgeEntryAction,
} from "@/server/actions/knowledge-base";

export async function KnowledgeBaseEditor({ scope }: { scope: TenantScope }) {
  const { entries, used, cap } = await knowledgeBaseEditor.getKnowledgeBase(scope);
  // Hiding the controls is not the authorization: the module re-checks.
  if (isOwner(scope))
    return (
      <KnowledgeBaseManager
        entries={entries}
        cap={cap}
        titleMaxLength={entryTitleMaxLength}
        save={saveKnowledgeEntryAction}
        remove={deleteKnowledgeEntryAction}
        importFile={importKnowledgeFileAction}
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
