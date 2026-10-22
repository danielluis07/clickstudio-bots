import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import type { SandboxChatMessage } from "@/modules/bot/hooks";

export function BotSandboxMessage({ message }: { message: SandboxChatMessage }) {
  const contact = message.author === "contact";
  return (
    <Message align={contact ? "end" : "start"}>
      <MessageContent>
        <MessageHeader>{contact ? "Você (contato de teste)" : "Bot"}</MessageHeader>
        <Bubble variant={contact ? "default" : "secondary"} align={contact ? "end" : "start"}>
          <BubbleContent className="whitespace-pre-wrap">{message.text}</BubbleContent>
        </Bubble>
        {message.handoff ? (
          <MessageFooter>
            Em uma conversa real, o atendimento passaria para a equipe. Neste teste, você pode
            continuar conversando.
          </MessageFooter>
        ) : null}
      </MessageContent>
    </Message>
  );
}
