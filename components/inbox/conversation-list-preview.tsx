"use client";

import { useBefore } from "@/hooks/use-before";
import { cn } from "@/lib/utils";
import { botReplyingLabel, messagePreviewText } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Conversation = Pick<
  RouterOutput["conversations"]["list"]["conversations"][number],
  "lastMessage" | "botReplyingUntil"
>;

// The list row's latest message. Like a messaging app, the Bot's reply in
// progress replaces it until the time the server gave.
export function ConversationListPreview({ conversation }: { conversation: Conversation }) {
  const botReplying = useBefore(conversation.botReplyingUntil);

  return (
    <span className={cn("min-w-0 flex-1 truncate", botReplying && "text-brand")}>
      {botReplying ? botReplyingLabel : messagePreviewText(conversation.lastMessage)}
    </span>
  );
}
