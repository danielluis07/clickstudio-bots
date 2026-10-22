import { MessageStatus } from "@/components/inbox/message-status";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  messageAuthorLabel,
  messageEditedLabel,
  messagePlaceholder,
} from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type ConversationMessage = RouterOutput["conversations"]["messages"]["messages"][number];

export function MessageBubble({ message }: { message: ConversationMessage }) {
  const outbound = message.direction === "outbound";
  const author = messageAuthorLabel(message);
  const edited = messageEditedLabel(message);

  return (
    <Message align={outbound ? "end" : "start"}>
      <MessageContent>
        {author && <MessageHeader className="wrap-anywhere">{author}</MessageHeader>}
        <Bubble variant={outbound ? "tinted" : "muted"} align={outbound ? "end" : "start"}>
          <BubbleContent
            className={cn("wrap-anywhere whitespace-pre-wrap", message.text === null && "italic")}
          >
            {message.text ?? messagePlaceholder(message)}
          </BubbleContent>
        </Bubble>
        <MessageFooter className="flex-wrap gap-1.5">
          {edited && <span>{edited}</span>}
          <time dateTime={message.sentAt.toISOString()}>{formatShortDateTime(message.sentAt)}</time>
          {message.status && <MessageStatus status={message.status} />}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
