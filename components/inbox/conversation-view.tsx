"use client";

import { ContactPanel } from "@/components/inbox/contact-panel";
import { ConversationHeader } from "@/components/inbox/conversation-header";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { MessageList } from "@/components/inbox/message-list";
import { ReplyComposer } from "@/components/inbox/reply-composer";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation, useReadConversationAlerts } from "@/modules/conversations/hooks";

export function ConversationView({
  conversationId,
  canDeleteContacts,
  onClose,
  detailsOpen,
  onToggleDetails,
}: {
  conversationId: string;
  canDeleteContacts: boolean;
  // Back to the list, also once the Contact is deleted.
  onClose: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const { data: conversation, isPending, isError } = useConversation(conversationId);
  useReadConversationAlerts(conversationId);

  if (isPending)
    return <Skeleton className="m-4 h-24" aria-busy="true" aria-label="Carregando conversa" />;
  if (isError)
    return (
      <InboxNotice alert>
        Não foi possível abrir esta conversa. Ela pode não existir mais.
      </InboxNotice>
    );

  return (
    <div className="flex min-h-0 min-w-0">
      <section
        aria-labelledby="conversa"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
      >
        <ConversationHeader
          conversation={conversation}
          canDeleteContacts={canDeleteContacts}
          onDeleted={onClose}
          onBack={onClose}
          detailsOpen={detailsOpen}
          onToggleDetails={onToggleDetails}
        />
        {/* A faint dotted backdrop sets the thread apart from the list. */}
        <div className="flex min-h-0 flex-1 flex-col bg-muted/40 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[18px_18px]">
          <MessageList conversationId={conversationId} />
          <ReplyComposer
            conversationId={conversationId}
            serviceWindowClosesAt={conversation.serviceWindowClosesAt}
          />
        </div>
      </section>
      {detailsOpen && (
        <div className="hidden min-h-0 w-80 shrink-0 lg:flex">
          <ContactPanel
            contact={conversation.contact}
            canDeleteContacts={canDeleteContacts}
            onDeleted={onClose}
          />
        </div>
      )}
    </div>
  );
}
