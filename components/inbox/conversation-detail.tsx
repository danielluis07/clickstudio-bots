"use client";

import { ArrowLeftIcon } from "lucide-react";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { ConversationMessages } from "@/components/inbox/conversation-messages";
import { InboxError } from "@/components/inbox/inbox-error";
import { InboxSkeleton } from "@/components/inbox/inbox-skeleton";
import { Button } from "@/components/ui/button";
import { useConversation } from "@/modules/conversations/hooks";

export function ConversationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { conversation, messages } = useConversation(id);
  if (conversation.isPending) return <div className="lg:col-span-2"><InboxSkeleton /></div>;
  if (conversation.isError) return <div className="lg:col-span-2"><Button variant="ghost" onClick={onBack}>Voltar às conversas</Button><InboxError retry={() => void conversation.refetch()} /></div>;
  return (
    <>
      <section className="flex h-[65dvh] min-w-0 flex-col lg:h-auto lg:min-h-0" aria-label="Conversa selecionada">
        <header className="flex items-center gap-3 border-b p-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Voltar às conversas"><ArrowLeftIcon aria-hidden="true" /></Button>
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{conversation.data.contact.name || conversation.data.contact.phone}</h2>
            <p className="text-xs text-muted-foreground">+{conversation.data.contact.phone}</p>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          {messages.isPending ? <InboxSkeleton /> : messages.isError ? <InboxError retry={() => void messages.refetch()} /> : <ConversationMessages messages={messages.data} />}
        </div>
      </section>
      <ContactPanel key={conversation.data.contact.id} conversation={conversation.data} />
    </>
  );
}
