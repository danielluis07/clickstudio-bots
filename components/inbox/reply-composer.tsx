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
    <form
      onSubmit={submit}
      className="flex shrink-0 flex-col gap-2 px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
    >
      {windowClosed && (
        <p id="janela-fechada" className="text-center text-xs text-muted-foreground">
          A janela de 24 horas para responder pelo painel está fechada. Continue a conversa pelo app
          WhatsApp Business.
        </p>
      )}
      {failed && (
        <p role="alert" className="text-center text-xs text-destructive">
          Não foi possível enviar a mensagem.
        </p>
      )}
      <div className="flex items-end gap-2 rounded-3xl border border-border bg-background p-1.5 pl-4 shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Textarea
          aria-label="Mensagem"
          aria-describedby={windowClosed ? "janela-fechada" : undefined}
          placeholder={
            windowClosed ? "Responda pelo app WhatsApp Business" : "Escreva uma resposta"
          }
          maxLength={4096}
          rows={1}
          className="max-h-[min(10rem,20dvh)] min-h-8 resize-none rounded-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          disabled={windowClosed}
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onKeyDown={keyDown}
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full"
          aria-label="Enviar"
          disabled={!canSend}
        >
          {sending ? <Spinner /> : <SendHorizontal />}
        </Button>
      </div>
    </form>
  );
}
