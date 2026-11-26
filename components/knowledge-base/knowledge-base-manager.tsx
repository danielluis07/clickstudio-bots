"use client";

import { unstable_rethrow } from "next/navigation";
import { KnowledgeBasePage } from "@/components/knowledge-base/knowledge-base-page";
import { KnowledgeEntryDialog } from "@/components/knowledge-base/knowledge-entry-dialog";
import { ImportKnowledgeFileButton } from "@/components/knowledge-base/import-knowledge-file-button";
import { KnowledgeEntrySection } from "@/components/knowledge-base/knowledge-entry-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { KnowledgeEntrySummary } from "@/modules/knowledge-base";
import {
  importFileDescription,
  useKnowledgeBaseEditor,
  type KnowledgeBaseActions,
} from "@/modules/knowledge-base/hooks";

// The owner's whole Base de conhecimento page, so the allowance in the rail
// follows each save.
export function KnowledgeBaseManager({
  entries,
  cap,
  titleMaxLength,
  save,
  remove,
  importFile,
}: KnowledgeBaseActions & {
  entries: KnowledgeEntrySummary[];
  cap: number;
  titleMaxLength: number;
}) {
  const editor = useKnowledgeBaseEditor({
    entries,
    save,
    remove,
    importFile,
    rethrow: unstable_rethrow,
  });
  const controls = { pending: editor.pending, open: editor.open, remove: editor.deleteEntry };

  return (
    <KnowledgeBasePage used={editor.used} cap={cap}>
      {editor.notice && (
        <Alert role="status">
          <AlertTitle>Arquivo importado</AlertTitle>
          <AlertDescription>{editor.notice}</AlertDescription>
        </Alert>
      )}
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
        extraAction={{
          control: (
            <ImportKnowledgeFileButton
              disabled={editor.pending}
              importing={editor.importing}
              onSelect={editor.importChosenFile}
            />
          ),
          description: importFileDescription,
        }}
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
