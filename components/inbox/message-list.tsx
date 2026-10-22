"use client";

import { InboxNotice } from "@/components/inbox/inbox-notice";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationMessages } from "@/modules/conversations/hooks";

export function MessageList({ conversationId }: { conversationId: string }) {
  const { messages, isPending, isError, hasOlder, loadOlder, isLoadingOlder } =
    useConversationMessages(conversationId);

  if (isPending)
    return <Skeleton className="m-4 h-32" aria-busy="true" aria-label="Carregando mensagens" />;
  if (isError)
    return (
      <InboxNotice alert>Não foi possível carregar as mensagens. Atualize a página.</InboxNotice>
    );

  // Reversed so the view opens at the latest message and keeps its place
  // when older messages load above.
  return (
    <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
      <div className="flex flex-col gap-3 p-4">
        {hasOlder && (
          <Button
            variant="outline"
            size="sm"
            className="self-center"
            onClick={loadOlder}
            disabled={isLoadingOlder}
          >
            Carregar anteriores
          </Button>
        )}
        <ol aria-label="Mensagens" className="flex flex-col gap-2">
          {messages.map((message) => (
            <li key={message.id}>
              <MessageBubble message={message} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
