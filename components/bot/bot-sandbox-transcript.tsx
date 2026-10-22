import { BotSandboxMessage } from "@/components/bot/bot-sandbox-message";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { SandboxChatMessage } from "@/modules/bot/hooks";

export function BotSandboxTranscript({ messages }: { messages: SandboxChatMessage[] }) {
  if (messages.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Converse como um contato</EmptyTitle>
          <EmptyDescription>
            Pergunte sobre seu negócio para conferir as respostas do Bot.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="h-96">
        <MessageScrollerViewport
          role="log"
          aria-label="Conversa de teste"
          aria-live="polite"
          aria-relevant="additions"
        >
          <MessageScrollerContent className="p-2">
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.author === "contact"}
              >
                <BotSandboxMessage message={message} />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Ir para a última mensagem" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
