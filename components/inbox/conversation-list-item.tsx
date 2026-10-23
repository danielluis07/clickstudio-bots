import { ConversationOwnership } from "@/components/inbox/conversation-ownership";
import { Checkbox } from "@/components/ui/checkbox";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { contactDisplayName } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type ConversationListItemProps = {
  conversation: RouterOutput["conversations"]["list"]["conversations"][number];
  selected: boolean;
  onSelect: (conversationId: string) => void;
  checked: boolean;
  selectionDisabled: boolean;
  onCheck: (conversationId: string, checked: boolean) => void;
};

export function ConversationListItem({
  conversation,
  selected,
  onSelect,
  checked,
  selectionDisabled,
  onCheck,
}: ConversationListItemProps) {
  return (
    <div className="flex min-w-0 items-center">
      {conversation.owner === "team" && (
        <Checkbox
          className="ml-4"
          aria-label={`Selecionar conversa com ${contactDisplayName(conversation.contact)}`}
          checked={checked}
          disabled={selectionDisabled}
          onCheckedChange={(value) => onCheck(conversation.id, value)}
        />
      )}
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(conversation.id)}
        className={cn(
          "flex w-full min-w-0 flex-col gap-1 px-4 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted",
          selected && "bg-muted",
        )}
      >
        <span className="max-w-full truncate font-medium">
          {contactDisplayName(conversation.contact)}
        </span>
        <ConversationOwnership conversation={conversation} />
        <time
          dateTime={conversation.lastMessageAt.toISOString()}
          className="text-xs text-muted-foreground"
        >
          {formatShortDateTime(conversation.lastMessageAt)}
        </time>
      </button>
    </div>
  );
}
