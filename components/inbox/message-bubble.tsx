import { formatShortDateTime } from "@/lib/format";
import type { RouterOutput } from "@/trpc/routers/_app";

type Message = RouterOutput["conversations"]["messages"]["messages"][number];

export function MessageBubble({ message }: { message: Message }) {
  return (
    <div className="flex w-fit max-w-[80%] flex-col gap-1 rounded-lg bg-muted px-3 py-2">
      <p className="text-sm whitespace-pre-wrap wrap-break-word">{message.text ?? "Mensagem sem texto"}</p>
      <time dateTime={message.sentAt.toISOString()} className="self-end text-xs text-muted-foreground">
        {formatShortDateTime(message.sentAt)}
      </time>
    </div>
  );
}
