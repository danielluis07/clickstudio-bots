"use client";

import { SendHorizontalIcon } from "lucide-react";
import { BotSandboxTranscript } from "@/components/bot/bot-sandbox-transcript";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { useBotSandbox } from "@/modules/bot/hooks";

// The test conversation: its transcript above the composer, in one panel.
export function BotSandboxChat({ sandbox }: { sandbox: ReturnType<typeof useBotSandbox> }) {
  return (
    <div className="flex flex-col gap-3">
      {sandbox.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando teste do Bot…
        </p>
      ) : null}
      {sandbox.loadFailed ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar o teste.{" "}
            <Button type="button" variant="link" onClick={sandbox.retry}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {sandbox.available === false ? (
        <Alert>
          <AlertDescription>
            O teste do Bot está indisponível no momento. Tente novamente mais tarde.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        <BotSandboxTranscript messages={sandbox.messages} />
        <form onSubmit={sandbox.submit} className="flex flex-col gap-2 border-t p-3">
          {sandbox.sending ? (
            <p role="status" className="text-xs text-muted-foreground">
              O Bot está respondendo…
            </p>
          ) : null}
          {sandbox.capReached ? (
            <Alert>
              <AlertDescription>
                Você atingiu o limite diário de testes do Bot. Tente novamente amanhã, após a
                meia-noite no horário de São Paulo.
              </AlertDescription>
            </Alert>
          ) : sandbox.error ? (
            <Alert variant="destructive">
              <AlertDescription>{sandbox.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex items-end gap-2">
            <label htmlFor="sandbox-message" className="sr-only">
              Mensagem de teste
            </label>
            <Textarea
              id="sandbox-message"
              maxLength={4096}
              rows={2}
              placeholder="Ex.: Qual é o horário de atendimento?"
              value={sandbox.text}
              onChange={(event) => sandbox.setText(event.target.value)}
              onKeyDown={sandbox.keyDown}
              disabled={sandbox.disabled}
              className="min-h-0 flex-1 resize-none"
            />
            <Button type="submit" disabled={!sandbox.canSend}>
              {sandbox.sending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SendHorizontalIcon data-icon="inline-start" />
              )}
              Enviar teste
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
