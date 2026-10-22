"use client";

import { ContactPanel } from "@/components/inbox/contact-panel";
import { ConversationHeader } from "@/components/inbox/conversation-header";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { MessageList } from "@/components/inbox/message-list";
import { ReplyComposer } from "@/components/inbox/reply-composer";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation } from "@/modules/conversations/hooks";

export function ConversationView({
  conversationId,
  canDeleteContacts,
  onDeleted,
}: {
  conversationId: string;
  canDeleteContacts: boolean;
  onDeleted: () => void;
}) {
  const { data: conversation, isPending, isError } = useConversation(conversationId);

  if (isPending)
    return <Skeleton className="m-4 h-24" aria-busy="true" aria-label="Carregando conversa" />;
  if (isError)
    return (
      <InboxNotice alert>
        Não foi possível abrir esta conversa. Ela pode não existir mais.
      </InboxNotice>
    );

  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem]">
      <section aria-labelledby="conversa" className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
        <ConversationHeader
          conversation={conversation}
          canDeleteContacts={canDeleteContacts}
          onDeleted={onDeleted}
        />
        <MessageList conversationId={conversationId} />
        <ReplyComposer
          conversationId={conversationId}
          serviceWindowClosesAt={conversation.serviceWindowClosesAt}
        />
      </section>
      <div className="hidden min-h-0 min-w-0 xl:flex">
        <ContactPanel
          contact={conversation.contact}
          canDeleteContacts={canDeleteContacts}
          onDeleted={onDeleted}
        />
      </div>
    </div>
  );
}
