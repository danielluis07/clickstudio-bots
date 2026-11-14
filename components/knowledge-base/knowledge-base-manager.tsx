"use client";

import { unstable_rethrow } from "next/navigation";
import { KnowledgeBasePage } from "@/components/knowledge-base/knowledge-base-page";
import { KnowledgeEntryDialog } from "@/components/knowledge-base/knowledge-entry-dialog";
import { KnowledgeEntrySection } from "@/components/knowledge-base/knowledge-entry-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { KnowledgeEntrySummary } from "@/modules/knowledge-base";
import { useKnowledgeBaseEditor, type KnowledgeBaseActions } from "@/modules/knowledge-base/hooks";

// The owner's whole Base de conhecimento page, so the allowance in the rail
// follows each save.
export function KnowledgeBaseManager({
  entries,
  cap,
  titleMaxLength,
  save,
  remove,
}: KnowledgeBaseActions & {
  entries: KnowledgeEntrySummary[];
  cap: number;
  titleMaxLength: number;
}) {
  const editor = useKnowledgeBaseEditor({
    entries,
    save,
    remove,
    rethrow: unstable_rethrow,
  });
  const controls = { pending: editor.pending, open: editor.open, remove: editor.deleteEntry };

  return (
    <KnowledgeBasePage used={editor.used} cap={cap}>
      {editor.failure && !editor.dialog && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível concluir a alteração</AlertTitle>
          <AlertDescription>
            <p>{editor.failure.message}</p>
            {editor.failure.target && (
              <Button
                type="button"
                variant="outline"
                disabled={editor.pending}
                onClick={editor.retry}
              >
                Revisar e tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <KnowledgeEntrySection
        kind="faq"
        entries={editor.entries.filter(({ kind }) => kind === "faq")}
        controls={controls}
      />
      <KnowledgeEntrySection
        kind="section"
        entries={editor.entries.filter(({ kind }) => kind === "section")}
        controls={controls}
      />
      {editor.dialog && editor.draft && (
        <KnowledgeEntryDialog
          target={editor.dialog}
          draft={editor.draft}
          pending={editor.pending}
          error={editor.failure?.message}
          otherEntriesSize={editor.used - (editor.dialog.entry?.size ?? 0)}
          cap={cap}
          titleMaxLength={titleMaxLength}
          onChange={editor.updateDraft}
          onSubmit={editor.submit}
          onClose={editor.close}
          onDiscard={editor.discard}
        />
      )}
    </KnowledgeBasePage>
  );
}
