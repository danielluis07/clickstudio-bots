import { ArrowLeft, Info } from "lucide-react";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { ContactDetailsSheet } from "@/components/inbox/contact-details-sheet";
import { HandoffControls } from "@/components/inbox/handoff-controls";
import { Button } from "@/components/ui/button";
import {
  contactDisplayName,
  conversationAnswererLabels,
  formatContactPhone,
} from "@/modules/conversations/hooks";
import type { RouterOutput } from "@/trpc/routers/_app";

// One line: back (small screens), who, the Handoff actions and the Contact's
// details, which open beside the thread on wide screens and in a sheet below.
export function ConversationHeader({
  conversation,
  canDeleteContacts,
  onDeleted,
  onBack,
  detailsOpen,
  onToggleDetails,
}: {
  conversation: RouterOutput["conversations"]["get"];
  canDeleteContacts: boolean;
  onDeleted: () => void;
  onBack: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-3 sm:px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-mr-1 lg:hidden"
        aria-label="Voltar às conversas"
        onClick={onBack}
      >
        <ArrowLeft />
      </Button>
      <ContactAvatar
        contact={conversation.contact}
        team={conversation.owner === "team"}
        className="size-9"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 id="conversa" className="truncate leading-tight font-semibold">
          {contactDisplayName(conversation.contact)}
        </h2>
        <p className="truncate text-xs text-muted-foreground">
          {formatContactPhone(conversation.contact.phone)} ·{" "}
          {conversationAnswererLabels[conversation.owner]}
          {conversation.waiting && " · Aguardando"}
        </p>
      </div>
      <div className="order-last basis-full sm:order-none sm:basis-auto">
        <HandoffControls conversation={conversation} />
      </div>
      <ContactDetailsSheet
        contact={conversation.contact}
        canDeleteContacts={canDeleteContacts}
        onDeleted={onDeleted}
      />
      <Button
        type="button"
        variant={detailsOpen ? "secondary" : "ghost"}
        size="icon"
        className="hidden lg:inline-flex"
        aria-label="Dados do contato"
        aria-pressed={detailsOpen}
        onClick={onToggleDetails}
      >
        <Info />
      </Button>
    </header>
  );
}
