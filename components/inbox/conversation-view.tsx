"use client";

import { ContactPanel } from "@/components/inbox/contact-panel";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { MessageList } from "@/components/inbox/message-list";
import { Skeleton } from "@/components/ui/skeleton";
import { contactDisplayName, formatContactPhone, useConversation } from "@/modules/conversations/hooks";

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { data: conversation, isPending, isError } = useConversation(conversationId);

  if (isPending) return <Skeleton className="m-4 h-24" aria-busy="true" aria-label="Carregando conversa" />;
  if (isError) return <InboxNotice alert>Não foi possível abrir esta conversa. Ela pode não existir mais.</InboxNotice>;

  return (
    <div className="grid min-h-0 grid-cols-[1fr_15rem]">
      <section aria-labelledby="conversa" className="flex min-h-0 flex-col">
        <header className="border-b border-border px-4 py-3">
          <h2 id="conversa" className="truncate font-semibold">{contactDisplayName(conversation.contact)}</h2>
          <p className="text-sm text-muted-foreground">{formatContactPhone(conversation.contact.phone)}</p>
        </header>
        <MessageList conversationId={conversationId} />
      </section>
      <ContactPanel contact={conversation.contact} />
    </div>
  );
}
