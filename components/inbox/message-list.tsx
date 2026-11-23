"use client";

import { HandoffDivider } from "@/components/inbox/handoff-divider";
import { InboxNotice } from "@/components/inbox/inbox-notice";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { Button } from "@/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import {
  placeHandoffs,
  useConversationHandoffs,
  useConversationMessages,
} from "@/modules/conversations/hooks";

export function MessageList({ conversationId }: { conversationId: string }) {
  const { messages, isPending, isError, hasOlder, loadOlder, isLoadingOlder } =
    useConversationMessages(conversationId);
  const handoffs = useConversationHandoffs(conversationId);

  if (isPending)
    return <Skeleton className="m-4 h-32" aria-busy="true" aria-label="Carregando mensagens" />;
  if (isError)
    return (
      <InboxNotice alert>Não foi possível carregar as mensagens. Atualize a página.</InboxNotice>
    );
  const handoffsAfter = placeHandoffs(messages, handoffs);

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="min-h-16 min-w-0 flex-1">
        <MessageScrollerViewport aria-label="Mensagens" role="region" tabIndex={0}>
          {hasOlder && (
            <div className="flex shrink-0 justify-center border-b border-border p-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-center"
                onClick={loadOlder}
                disabled={isLoadingOlder}
              >
                Carregar anteriores
              </Button>
            </div>
          )}
          <MessageScrollerContent className="gap-3 p-3 sm:p-4">
            {/* Keep each message a direct scroller item: sender groups would
                change the measured anchors when an older page extends a run.
                A Handoff's divider rides in the item of the message before it. */}
            {messages.map((message) => (
              <MessageScrollerItem key={message.id} messageId={message.id}>
                <MessageBubble message={message} />
                {handoffsAfter.get(message.id)?.map((handoff) => (
                  <HandoffDivider key={handoff.id} handoff={handoff} />
                ))}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Ir para a última mensagem" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
