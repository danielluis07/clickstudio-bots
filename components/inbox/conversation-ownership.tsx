import { Badge } from "@/components/ui/badge";
import { conversationOwnerLabels, handoffReasonLabels } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

type Ownership = Pick<RouterOutput["conversations"]["get"], "owner" | "handoffReason" | "waiting">;

// Who answers the Conversation, why it was handed off and whether it waits.
export function ConversationOwnership({ conversation }: { conversation: Ownership }) {
  const reason = conversation.handoffReason && handoffReasonLabels[conversation.handoffReason];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant={conversation.owner === "team" ? "default" : "outline"}>
        {conversationOwnerLabels[conversation.owner]}
      </Badge>
      {conversation.waiting && <Badge variant="secondary">Aguardando</Badge>}
      {reason && <span className="truncate">{reason}</span>}
    </div>
  );
}
