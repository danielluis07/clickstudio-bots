import { EditableKnowledgeEntry } from "@/components/knowledge-base/editable-knowledge-entry";
import { KnowledgeEntryView } from "@/components/knowledge-base/knowledge-entry-view";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { KnowledgeEntryKind, KnowledgeEntrySummary } from "@/modules/knowledge-base";
import { knowledgeEntryLabels, type KnowledgeEntryTarget } from "@/modules/knowledge-base/hooks";

type KnowledgeEntrySectionProps = {
  kind: KnowledgeEntryKind;
  entries: KnowledgeEntrySummary[];
  controls?: {
    pending: boolean;
    open: (target: KnowledgeEntryTarget) => void;
    remove: (entryId: string) => Promise<void>;
  };
};

export function KnowledgeEntrySection({ kind, entries, controls }: KnowledgeEntrySectionProps) {
  const labels = knowledgeEntryLabels[kind];
  const headingId = `base-${kind}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-xl font-semibold">
            {labels.heading}
          </h2>
          <p className="text-muted-foreground">{labels.description}</p>
        </div>
        {controls && (
          <Button type="button" onClick={() => controls.open({ kind })} disabled={controls.pending}>
            {labels.add}
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{labels.empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              {controls ? (
                <EditableKnowledgeEntry
                  entry={entry}
                  disabled={controls.pending}
                  onEdit={() => controls.open({ kind, entry })}
                  onDelete={controls.remove}
                />
              ) : (
                <KnowledgeEntryView entry={entry} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
