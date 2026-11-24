import { MessageCircleIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  alertChannelLabels,
  alertKindLabel,
  alertPreviewText,
  contactDisplayName,
  formatTimeAgo,
} from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

export type AlertEntry = RouterOutput["alerts"]["list"]["alerts"][number];

// Opens the Conversation in Conversas, which reads its Alerts.
export function AlertListItem({
  alert,
  now,
  onOpen,
}: {
  alert: AlertEntry;
  now: Date;
  onOpen: () => void;
}) {
  const preview = alertPreviewText(alert.preview);
  return (
    <Link
      href={`/painel/conversas?conversa=${encodeURIComponent(alert.conversationId)}`}
      onClick={onOpen}
      className="flex items-start gap-3 px-3 py-2.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted"
    >
      <MessageCircleIcon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-label={alertChannelLabels[alert.channel]}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate", !alert.read && "font-semibold")}>
          {contactDisplayName(alert.contact)}
        </span>
        <span className="truncate text-xs text-muted-foreground">{alertKindLabel(alert)}</span>
        {preview && <span className="line-clamp-2 text-xs text-muted-foreground">{preview}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <time
          dateTime={alert.raisedAt.toISOString()}
          className="text-xs text-muted-foreground tabular-nums"
        >
          {formatTimeAgo(alert.raisedAt, now)}
        </time>
        {!alert.read && (
          <span className="size-2 rounded-full bg-brand">
            <span className="sr-only">Não lido</span>
          </span>
        )}
      </span>
    </Link>
  );
}
