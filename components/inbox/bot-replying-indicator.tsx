"use client";

import { Bot } from "lucide-react";
import { useBefore } from "@/hooks/use-before";
import { botReplyingLabel } from "@/modules/conversations/hooks";

// Below the thread while the Bot works on a reply, until the time the server
// gave: its reply, a Handoff or a skip refreshes the Conversation sooner.
export function BotReplyingIndicator({ until }: { until: Date | null }) {
  if (!useBefore(until)) return null;

  return (
    <p
      role="status"
      className="flex shrink-0 items-center gap-1.5 px-3 pb-2 text-xs text-muted-foreground sm:px-4"
    >
      <Bot aria-hidden className="size-3.5 motion-safe:animate-pulse" />
      {botReplyingLabel}
    </p>
  );
}
