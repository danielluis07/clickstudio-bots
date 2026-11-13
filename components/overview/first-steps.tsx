"use client";

import Link from "next/link";
import { BotChannelStep } from "@/components/bot/bot-channel-step";
import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
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
      <DashboardRailSection title="Bot">
        <p role="status" className="text-sm text-muted-foreground">
          O responsável ainda está configurando o Bot.
        </p>
      </DashboardRailSection>
    );

  const ready = status.connected && status.profile && status.knowledge && status.tested;
  const done = [status.connected, status.profile, status.knowledge, status.tested].filter(
    Boolean,
  ).length;
  return (
    <DashboardRailSection title="Primeiros passos" aside={`${done} de 5`}>
      <ol className="flex flex-col">
        <FirstStep label="WhatsApp" done={status.connected}>
          <span className="text-sm">
            <BotChannelStep connected={status.connected} />
          </span>
        </FirstStep>
        <FirstStep label="Perfil do negócio" done={status.profile}>
          <Link href="/painel/bot/perfil" className={stepLink}>
            Preencher
          </Link>
        </FirstStep>
        <FirstStep label="Base de conhecimento" done={status.knowledge}>
          <Link href="/painel/base-de-conhecimento" className={stepLink}>
            Adicionar
          </Link>
        </FirstStep>
        <FirstStep label="Testar o Bot" done={status.tested}>
          <Link href="/painel/bot/testar" className={stepLink}>
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
    </DashboardRailSection>
  );
}
