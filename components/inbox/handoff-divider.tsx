import { UsersRound } from "lucide-react";
import { formatShortDateTime } from "@/lib/format";
import { handoffDividerLabel, type ThreadHandoff } from "@/modules/conversations/hooks";

// A rule across the thread where the Conversation passed to the team.
export function HandoffDivider({ handoff }: { handoff: ThreadHandoff }) {
  return (
    <div role="note" className="flex items-center gap-3 pt-3 text-xs text-muted-foreground">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span className="flex min-w-0 items-center gap-1.5 text-center">
        <UsersRound aria-hidden className="size-3.5 shrink-0 text-brand" />
        <span className="wrap-anywhere">
          {handoffDividerLabel(handoff)} ·{" "}
          <time dateTime={handoff.occurredAt.toISOString()}>
            {formatShortDateTime(handoff.occurredAt)}
          </time>
        </span>
      </span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
