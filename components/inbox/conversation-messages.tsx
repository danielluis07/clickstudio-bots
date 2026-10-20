"use client";

import { ArrowDownIcon } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { formatDateTime } from "@/lib/format";
import type { RouterOutput } from "@/server/trpc/router";
import { InboxEmpty } from "@/components/inbox/inbox-empty";

export function ConversationMessages({ messages }: { messages: RouterOutput["conversations"]["messages"] }) {
  if (messages.length === 0) return <InboxEmpty title="Nenhuma mensagem" description="As mensagens recebidas nesta conversa aparecem aqui." />;
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport aria-label="Mensagens da conversa">
          <MessageScrollerContent className="p-5">
            {messages.map((message) => (
              <MessageScrollerItem key={message.wamid} messageId={message.wamid}>
                <Message align="start">
                  <MessageContent>
                    <Bubble variant="muted"><BubbleContent className="whitespace-pre-wrap wrap-anywhere">{message.text}</BubbleContent></Bubble>
                    <MessageFooter><time dateTime={message.sentAt.toISOString()}>{formatDateTime(message.sentAt)}</time></MessageFooter>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Ir para a mensagem mais recente"><ArrowDownIcon aria-hidden="true" /></MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
