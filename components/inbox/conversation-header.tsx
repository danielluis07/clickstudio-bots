import { ContactDetailsSheet } from "@/components/inbox/contact-details-sheet";
import { ConversationOwnership } from "@/components/inbox/conversation-ownership";
import { HandoffControls } from "@/components/inbox/handoff-controls";
import { contactDisplayName, formatContactPhone } from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

export function ConversationHeader({
  conversation,
  canDeleteContacts,
  onDeleted,
}: {
  conversation: RouterOutput["conversations"]["get"];
  canDeleteContacts: boolean;
  onDeleted: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="conversa" className="truncate font-semibold">
          {contactDisplayName(conversation.contact)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatContactPhone(conversation.contact.phone)}
        </p>
        <ConversationOwnership conversation={conversation} />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <HandoffControls conversation={conversation} />
        <ContactDetailsSheet
          contact={conversation.contact}
          canDeleteContacts={canDeleteContacts}
          onDeleted={onDeleted}
        />
      </div>
    </header>
  );
}
