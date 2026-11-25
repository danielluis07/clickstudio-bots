import { MessageAuthor } from "@/components/inbox/message-author";
import { MessageStatus } from "@/components/inbox/message-status";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { formatShortDateTime } from "@/platform/format";
import { cn } from "@/lib/utils";
import {
  messageAuthorKind,
  messageAuthorLabel,
  messageEditedLabel,
  messageDisplayText,
  type MessageAuthorKind,
} from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type ConversationMessage = RouterOutput["conversations"]["messages"]["messages"][number];

// Neutral for the Contact, then the brand, softer for the Bot than the team.
const bubbleVariants = {
  contact: "muted",
  bot: "brand-soft",
  team: "brand-tint",
} as const satisfies Record<MessageAuthorKind, string>;

export function MessageBubble({ message }: { message: ConversationMessage }) {
  const outbound = message.direction === "outbound";
  const author = messageAuthorLabel(message);
  const edited = messageEditedLabel(message);

  return (
    <Message align={outbound ? "end" : "start"}>
      <MessageContent>
        {author && message.origin !== "contact" && (
          <MessageAuthor origin={message.origin} label={author} />
        )}
        <Bubble
          variant={bubbleVariants[messageAuthorKind(message)]}
          align={outbound ? "end" : "start"}
        >
          <BubbleContent
            className={cn("wrap-anywhere whitespace-pre-wrap", message.text === null && "italic")}
          >
            {messageDisplayText(message)}
          </BubbleContent>
        </Bubble>
        <MessageFooter className="flex-wrap gap-1.5">
          {edited && <span>{edited}</span>}
          <time dateTime={message.sentAt.toISOString()}>{formatShortDateTime(message.sentAt)}</time>
          {message.status && (
            <MessageStatus status={message.status} failureCode={message.failureCode} />
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
