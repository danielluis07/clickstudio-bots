"use client";

import { SendHorizontalIcon } from "lucide-react";
import { BotSandboxContactDetails } from "@/components/bot/bot-sandbox-contact-details";
import { BotSandboxTranscript } from "@/components/bot/bot-sandbox-transcript";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useBotSandbox } from "@/modules/bot/hooks";

export function BotSandboxChat() {
  const sandbox = useBotSandbox();
  return (
    <Card id="testar-bot" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Testar Bot</CardTitle>
        <CardDescription>
          Teste as configurações e a base de conhecimento salvas antes de ativar o Bot. Salve suas
          alterações antes de enviar uma mensagem. Nenhuma mensagem será enviada ao WhatsApp e os
          testes não consomem suas respostas do mês. A conversa de teste é descartada ao sair desta
          página.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sandbox.loading ? <p role="status">Carregando teste do Bot…</p> : null}
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
        <BotSandboxTranscript messages={sandbox.messages} />
        <BotSandboxContactDetails details={sandbox.contactDetails} />
        {sandbox.sending ? (
          <p role="status" className="text-sm text-muted-foreground">
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
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3">
        <form onSubmit={sandbox.submit}>
          <FieldGroup>
            <Field data-disabled={sandbox.disabled}>
              <FieldLabel htmlFor="sandbox-message">Mensagem de teste</FieldLabel>
              <Textarea
                id="sandbox-message"
                maxLength={4096}
                rows={2}
                placeholder="Ex.: Qual é o horário de atendimento?"
                value={sandbox.text}
                onChange={(event) => sandbox.setText(event.target.value)}
                onKeyDown={sandbox.keyDown}
                disabled={sandbox.disabled}
              />
            </Field>
            <Button type="submit" disabled={!sandbox.canSend}>
              {sandbox.sending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SendHorizontalIcon data-icon="inline-start" />
              )}
              Enviar teste
            </Button>
          </FieldGroup>
        </form>
        {sandbox.allowance ? (
          <p className="text-sm text-muted-foreground">
            Testes hoje: {sandbox.allowance.used} / {sandbox.allowance.limit}. O limite renova à
            meia-noite no horário de São Paulo.
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
