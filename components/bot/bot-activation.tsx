"use client";

import Link from "next/link";
import { BotChannelStep } from "@/components/bot/bot-channel-step";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useBotActivation } from "@/modules/bot/hooks";

export function BotActivation({ canActivate }: { canActivate: boolean }) {
  const bot = useBotActivation();
  const status = bot.status.data;
  const ready = status?.profile && status.knowledge && status.tested && status.connected;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {status?.enabled ? (status.paused ? "Bot pausado" : "Bot ativo") : "Ativar Bot"}
        </CardTitle>
        <CardDescription>
          Prepare e teste o Bot antes de responder aos contatos no WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status ? (
          <ol className="flex list-inside list-decimal flex-col gap-2 text-sm">
            <li>Perfil do negócio: {status.profile ? "salvo" : "salve as configurações abaixo"}</li>
            <li>
              <Link href="/painel/base-de-conhecimento" className="underline">
                Base de conhecimento
              </Link>
              : {status.knowledge ? "preenchida" : "adicione ao menos uma informação"}
            </li>
            <li>
              Testar Bot:{" "}
              {status.tested ? "concluído" : "envie um teste após salvar suas alterações"}
            </li>
            <li>
              WhatsApp: <BotChannelStep connected={status.connected} />
            </li>
          </ol>
        ) : (
          <p role="status">
            {bot.status.isError ? "Não foi possível carregar as etapas." : "Carregando etapas…"}
          </p>
        )}
        {status?.enabled ? (
          <p className="text-sm text-muted-foreground">
            A pausa vale para todo o Canal. O horário configurado continua valendo ao retomar.
          </p>
        ) : null}
        {bot.error ? (
          <p role="alert" className="text-sm text-destructive">
            {bot.error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        {status?.enabled ? (
          <Button
            type="button"
            variant="outline"
            disabled={bot.pending}
            onClick={bot.togglePause}
            aria-pressed={status.paused}
          >
            {status.paused ? "Retomar Bot" : "Pausar Bot"}
          </Button>
        ) : canActivate ? (
          <Button type="button" disabled={!ready || bot.pending} onClick={bot.activate}>
            Ativar Bot
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Apenas o responsável pelo negócio pode ativar o Bot.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
