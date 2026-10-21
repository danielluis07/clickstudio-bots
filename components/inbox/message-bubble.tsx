import { MessageStatus } from "@/components/inbox/message-status";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messageAuthorLabel } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Message = RouterOutput["conversations"]["messages"]["messages"][number];

export function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  const author = messageAuthorLabel(message);

  return (
    <div className={cn("flex w-fit max-w-[80%] flex-col gap-1 rounded-lg px-3 py-2", outbound ? "ml-auto bg-primary/10" : "bg-muted")}>
      {author && <p className="text-xs font-medium text-muted-foreground">{author}</p>}
      <p className="text-sm whitespace-pre-wrap wrap-break-word">{message.text ?? "Mensagem sem texto"}</p>
      <div className="flex items-center gap-1.5 self-end text-xs text-muted-foreground">
        <time dateTime={message.sentAt.toISOString()}>{formatShortDateTime(message.sentAt)}</time>
        {message.status && <MessageStatus status={message.status} />}
      </div>
    </div>
  );
}
