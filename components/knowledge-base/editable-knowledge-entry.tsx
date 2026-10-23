"use client";

import { DeleteKnowledgeEntryButton } from "@/components/knowledge-base/delete-knowledge-entry-button";
import { KnowledgeEntryView } from "@/components/knowledge-base/knowledge-entry-view";
import { Button } from "@/components/ui/button";
import type { KnowledgeEntrySummary } from "@/modules/knowledge-base";

type EditableKnowledgeEntryProps = {
  entry: KnowledgeEntrySummary;
  disabled: boolean;
  onEdit: () => void;
  onDelete: (entryId: string) => Promise<void>;
};

export function EditableKnowledgeEntry({
  entry,
  disabled,
  onEdit,
  onDelete,
}: EditableKnowledgeEntryProps) {
  return (
    <KnowledgeEntryView
      entry={entry}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={disabled}>
            Editar
          </Button>
          <DeleteKnowledgeEntryButton
            entryId={entry.id}
            entryTitle={entry.title}
            disabled={disabled}
            onDelete={onDelete}
          />
        </>
      }
    />
  );
}
