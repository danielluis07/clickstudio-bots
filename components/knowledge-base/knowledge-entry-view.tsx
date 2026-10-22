import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import { entryEditorLabel } from "@/modules/knowledge-base/hooks";

type KnowledgeEntryViewProps = {
  entry: { title: string; body: string; updatedAt: Date; updatedBy: string | null };
  // The owner's edit and delete controls.
  actions?: ReactNode;
};

export function KnowledgeEntryView({ entry, actions }: KnowledgeEntryViewProps) {
  return (
    <article className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium wrap-break-word">{entry.title}</h3>
        {actions && <div className="flex gap-1">{actions}</div>}
      </div>
      <p className="text-sm wrap-break-word whitespace-pre-wrap">{entry.body}</p>
      <p className="text-xs text-muted-foreground">
        Editado em {formatDateTime(entry.updatedAt)} por {entryEditorLabel(entry.updatedBy)}
      </p>
    </article>
  );
}
