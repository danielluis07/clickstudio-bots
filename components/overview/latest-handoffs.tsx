import Link from "next/link";
import type { RecentHandoff } from "@/modules/conversations";
import {
  contactDisplayName,
  formatTimeAgo,
  handoffReasonLabels,
} from "@/modules/conversations/hooks";

// The newest Handoffs, each opening its Conversation in Conversas.
export function LatestHandoffs({ handoffs, now }: { handoffs: RecentHandoff[]; now: Date }) {
  if (handoffs.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhum Handoff no período.</p>;
  return (
    <ul className="-mx-2 flex flex-col">
      {handoffs.map((handoff) => (
        <li key={`${handoff.conversationId}-${handoff.at.getTime()}`}>
          <Link
            href={`/painel/conversas?conversa=${encodeURIComponent(handoff.conversationId)}`}
            className="flex items-baseline gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{contactDisplayName(handoff.contact)}</span>
              <span className="truncate text-xs text-muted-foreground">
                {handoffReasonLabels[handoff.reason]}
              </span>
            </span>
            <time
              dateTime={handoff.at.toISOString()}
              className="shrink-0 text-xs text-muted-foreground tabular-nums"
            >
              {formatTimeAgo(handoff.at, now)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
