import { PlusIcon } from "lucide-react";
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
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="text-sm font-semibold">
            {labels.heading}
            <span
              aria-hidden="true"
              className="ml-2 text-xs font-normal text-muted-foreground tabular-nums"
            >
              {entries.length}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">{labels.description}</p>
        </div>
        {controls && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => controls.open({ kind })}
            disabled={controls.pending}
          >
            <PlusIcon data-icon="inline-start" />
            {labels.add}
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <Empty className="border p-6">
          <EmptyHeader>
            <EmptyTitle className="text-sm font-normal text-muted-foreground">
              {labels.empty}
            </EmptyTitle>
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
