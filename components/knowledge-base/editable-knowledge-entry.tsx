"use client";

import { useState } from "react";
import { DeleteKnowledgeEntryButton } from "@/components/knowledge-base/delete-knowledge-entry-button";
import { KnowledgeEntryForm } from "@/components/knowledge-base/knowledge-entry-form";
import { KnowledgeEntryView } from "@/components/knowledge-base/knowledge-entry-view";
import { Button } from "@/components/ui/button";
import type { KnowledgeEntryKind } from "@/modules/knowledge-base/hooks";

type EditableKnowledgeEntryProps = {
  kind: KnowledgeEntryKind;
  entry: { id: string; title: string; body: string; updatedAt: Date; updatedBy: string | null; size: number };
  used: number;
  cap: number;
  titleMaxLength: number;
};

export function EditableKnowledgeEntry({ kind, entry, used, cap, titleMaxLength }: EditableKnowledgeEntryProps) {
  const [editing, setEditing] = useState(false);
  const stopEditing = () => setEditing(false);

  if (editing) {
    return (
      <KnowledgeEntryForm
        kind={kind}
        entry={entry}
        otherEntriesSize={used - entry.size}
        cap={cap}
        titleMaxLength={titleMaxLength}
        onSaved={stopEditing}
        onCancel={stopEditing}
      />
    );
  }

  return (
    <KnowledgeEntryView
      entry={entry}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>Editar</Button>
          <DeleteKnowledgeEntryButton entryId={entry.id} entryTitle={entry.title} />
        </>
      }
    />
  );
}
