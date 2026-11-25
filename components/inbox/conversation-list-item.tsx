import { ConversationListAvatar } from "@/components/inbox/conversation-list-avatar";
import { ConversationOwnerIcon } from "@/components/inbox/conversation-owner-icon";
import { Badge } from "@/components/ui/badge";
import { formatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  contactDisplayName,
  messagePreviewText,
  openConversationLabel,
} from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type ConversationListItemProps = {
  conversation: RouterOutput["conversations"]["list"]["conversations"][number];
  now: Date;
  selected: boolean;
  onSelect: (conversationId: string) => void;
  selecting: boolean;
  checked: boolean;
  selectionDisabled: boolean;
  onCheck: (conversationId: string, checked: boolean) => void;
};

export function ConversationListItem({
  conversation,
  now,
  selected,
  onSelect,
  selecting,
  checked,
  selectionDisabled,
  onCheck,
}: ConversationListItemProps) {
  const { waiting } = conversation;

  return (
    <div
      className={cn(
        "group/row relative flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted",
        selected && "bg-muted",
      )}
    >
      <ConversationListAvatar
        contact={conversation.contact}
        selectable={conversation.owner === "team"}
        selecting={selecting}
        checked={checked}
        disabled={selectionDisabled}
        onCheck={(value) => onCheck(conversation.id, value)}
      />
      {/* The button's overlay makes the whole row clickable; the avatar's
          checkbox sits above it. */}
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(conversation.id)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn("min-w-0 flex-1 truncate", waiting ? "font-semibold" : "font-medium")}
          >
            {contactDisplayName(conversation.contact)}
          </span>
          <time
            dateTime={conversation.lastMessageAt.toISOString()}
            className={cn(
              "shrink-0 text-xs tabular-nums",
              waiting ? "font-medium text-brand" : "text-muted-foreground",
            )}
          >
            {formatListTime(conversation.lastMessageAt, now)}
          </time>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ConversationOwnerIcon conversation={conversation} />
          <span className="min-w-0 flex-1 truncate">
            {messagePreviewText(conversation.lastMessage)}
          </span>
          {waiting && (
            <Badge className="ml-0.5 h-4 bg-brand px-1.5 text-[0.65rem] text-brand-foreground">
              {openConversationLabel}
            </Badge>
          )}
        </span>
      </button>
    </div>
  );
}
