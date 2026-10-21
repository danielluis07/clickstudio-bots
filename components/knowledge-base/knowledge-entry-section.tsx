import { EditableKnowledgeEntry } from "@/components/knowledge-base/editable-knowledge-entry";
import { KnowledgeEntryForm } from "@/components/knowledge-base/knowledge-entry-form";
import { KnowledgeEntryView } from "@/components/knowledge-base/knowledge-entry-view";
import type { KnowledgeEntryKind, KnowledgeEntrySummary } from "@/modules/knowledge-base";
import { knowledgeEntryLabels } from "@/modules/knowledge-base/hooks";

type KnowledgeEntrySectionProps = {
  kind: KnowledgeEntryKind;
  entries: KnowledgeEntrySummary[];
  used: number;
  cap: number;
  titleMaxLength: number;
  // Shown to the owner, who is the only one allowed to edit.
  canEdit: boolean;
};

export function KnowledgeEntrySection({ kind, entries, used, cap, titleMaxLength, canEdit }: KnowledgeEntrySectionProps) {
  const labels = knowledgeEntryLabels[kind];
  const headingId = `base-${kind}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold">{labels.heading}</h2>
        <p className="text-muted-foreground">{labels.description}</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              {canEdit ? (
                <EditableKnowledgeEntry kind={kind} entry={entry} used={used} cap={cap} titleMaxLength={titleMaxLength} />
              ) : (
                <KnowledgeEntryView entry={entry} />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex max-w-2xl flex-col gap-3">
          <h3 className="font-medium">{labels.add}</h3>
          <KnowledgeEntryForm kind={kind} otherEntriesSize={used} cap={cap} titleMaxLength={titleMaxLength} />
        </div>
      )}
    </section>
  );
}
