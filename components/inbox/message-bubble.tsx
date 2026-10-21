import { MessageStatus } from "@/components/inbox/message-status";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messageAuthorLabel, messageEditedLabel, messagePlaceholder } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Message = RouterOutput["conversations"]["messages"]["messages"][number];

export function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  const author = messageAuthorLabel(message);
  const edited = messageEditedLabel(message);

  return (
    <div className={cn("flex w-fit max-w-[80%] flex-col gap-1 rounded-lg px-3 py-2", outbound ? "ml-auto bg-primary/10" : "bg-muted")}>
      {author && <p className="text-xs font-medium text-muted-foreground">{author}</p>}
      <p className={cn("text-sm whitespace-pre-wrap wrap-break-word", message.text === null && "text-muted-foreground italic")}>
        {message.text ?? messagePlaceholder(message)}
      </p>
      <div className="flex items-center gap-1.5 self-end text-xs text-muted-foreground">
        {edited && <span>{edited}</span>}
        <time dateTime={message.sentAt.toISOString()}>{formatShortDateTime(message.sentAt)}</time>
        {message.status && <MessageStatus status={message.status} />}
      </div>
    </div>
  );
}
