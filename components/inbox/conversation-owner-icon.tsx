import { Bot, Headset } from "lucide-react";
import { cn } from "@/lib/utils";
import { conversationStatusLine } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Conversation = Pick<
  RouterOutput["conversations"]["list"]["conversations"][number],
  "owner" | "handoffReason"
>;

// Who answers the Conversation, as a small icon. Its name, read aloud and shown
// on hover, also gives the Handoff reason when the team answers.
export function ConversationOwnerIcon({ conversation }: { conversation: Conversation }) {
  const label = conversationStatusLine(conversation);
  const Icon = conversation.owner === "team" ? Headset : Bot;

  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0">
      <Icon aria-hidden className={cn("size-3.5", conversation.owner === "team" && "text-brand")} />
    </span>
  );
}
