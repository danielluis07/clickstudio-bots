"use client";

import Link from "next/link";
import { BotChannelStep } from "@/components/bot/bot-channel-step";
import { FirstStep } from "@/components/overview/first-step";
import { Button } from "@/components/ui/button";
import { useBotActivation } from "@/modules/bot/hooks";

const stepLink = "text-sm font-medium text-primary underline-offset-4 hover:underline";

// "Primeiros passos": while the Bot is not live, the owner's way through the
// same checks as "Ativar Bot". An attendant only learns it is not live yet.
export function FirstSteps({ isOwner }: { isOwner: boolean }) {
  const bot = useBotActivation();
  const status = bot.status.data;
  if (!status || status.enabled) return null;

  if (!isOwner)
    return (
      <p role="status" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        O responsável ainda está configurando o Bot.
      </p>
    );

  const ready = status.connected && status.profile && status.knowledge && status.tested;
  const done = [status.connected, status.profile, status.knowledge, status.tested].filter(
    Boolean,
  ).length;
  return (
    <section
      aria-labelledby="primeiros-passos"
      className="flex flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="primeiros-passos" className="text-sm font-medium">
          Primeiros passos
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{`${done} de 5`}</span>
      </div>
      <ol className="flex flex-col divide-y">
        <FirstStep label="WhatsApp" done={status.connected}>
          <span className="text-sm">
            <BotChannelStep connected={status.connected} />
          </span>
        </FirstStep>
        <FirstStep label="Perfil do negócio" done={status.profile}>
          <Link href="/painel/bot" className={stepLink}>
            Preencher
          </Link>
        </FirstStep>
        <FirstStep label="Base de conhecimento" done={status.knowledge}>
          <Link href="/painel/base-de-conhecimento" className={stepLink}>
            Adicionar
          </Link>
        </FirstStep>
        <FirstStep label="Testar o Bot" done={status.tested}>
          <Link href="/painel/bot#testar-bot" className={stepLink}>
            Testar
          </Link>
        </FirstStep>
        <FirstStep label="Ativar o Bot" done={false}>
          <Button type="button" size="sm" disabled={!ready || bot.pending} onClick={bot.activate}>
            Ativar Bot
          </Button>
        </FirstStep>
      </ol>
      {bot.error && (
        <p role="alert" className="text-sm text-destructive">
          {bot.error}
        </p>
      )}
    </section>
  );
}
