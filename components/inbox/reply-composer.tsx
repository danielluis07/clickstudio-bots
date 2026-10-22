"use client";

import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useReplyComposer } from "@/modules/conversations/hooks";

type ReplyComposerProps = {
  conversationId: string;
  serviceWindowClosesAt: Date | null;
};

export function ReplyComposer(props: ReplyComposerProps) {
  const { text, changeText, submit, keyDown, windowClosed, canSend, sending, failed } =
    useReplyComposer(props);

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-border p-3">
      {windowClosed && (
        <p id="janela-fechada" className="text-sm text-muted-foreground">
          A janela de 24 horas para responder pelo painel está fechada. Continue a conversa pelo app
          WhatsApp Business.
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível enviar a mensagem.
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Mensagem"
          aria-describedby={windowClosed ? "janela-fechada" : undefined}
          placeholder={
            windowClosed ? "Responda pelo app WhatsApp Business" : "Escreva uma resposta"
          }
          maxLength={4096}
          rows={1}
          className="max-h-40 min-h-9 resize-none"
          disabled={windowClosed}
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onKeyDown={keyDown}
        />
        <Button type="submit" size="icon" aria-label="Enviar" disabled={!canSend}>
          {sending ? <Spinner /> : <SendHorizontal />}
        </Button>
      </div>
    </form>
  );
}
