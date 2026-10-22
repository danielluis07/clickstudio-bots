import { ConversationOwnership } from "@/components/inbox/conversation-ownership";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { contactDisplayName } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type ConversationListItemProps = {
  conversation: RouterOutput["conversations"]["list"]["conversations"][number];
  selected: boolean;
  onSelect: (conversationId: string) => void;
};

export function ConversationListItem({
  conversation,
  selected,
  onSelect,
}: ConversationListItemProps) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted",
        selected && "bg-muted",
      )}
    >
      <span className="truncate font-medium">{contactDisplayName(conversation.contact)}</span>
      <ConversationOwnership conversation={conversation} />
      <time
        dateTime={conversation.lastMessageAt.toISOString()}
        className="text-xs text-muted-foreground"
      >
        {formatShortDateTime(conversation.lastMessageAt)}
      </time>
    </button>
  );
}
