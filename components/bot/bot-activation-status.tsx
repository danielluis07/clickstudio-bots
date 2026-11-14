"use client";

import { cn } from "cn";
import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotActivation } from "@/modules/bot/hooks";

// The top of the Ativação rail: whether the Bot answers, the owner's
// activation and any Member's pause control.
export function BotActivationStatus({ canActivate }: { canActivate: boolean }) {
  const bot = useBotActivation();
  const status = bot.status.data;
  const ready = status && status.profile && status.knowledge && status.tested && status.connected;

  return (
    <DashboardRailSection title="Bot">
      {!status ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                !status.enabled
                  ? "bg-muted-foreground/40"
                  : status.paused
                    ? "bg-amber-500"
                    : "bg-emerald-500",
              )}
            />
            {!status.enabled
              ? "Não ativado"
              : status.paused
                ? "Pausado"
                : "Respondendo os contatos"}
          </p>
          {status.enabled ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={bot.pending}
                onClick={bot.togglePause}
                aria-pressed={status.paused}
              >
                {status.paused ? "Retomar Bot" : "Pausar Bot"}
              </Button>
              <p className="text-xs text-muted-foreground">
                A pausa vale para todo o Canal. O horário configurado continua valendo ao retomar.
              </p>
            </>
          ) : canActivate ? (
            <>
              <Button type="button" disabled={!ready || bot.pending} onClick={bot.activate}>
                Ativar Bot
              </Button>
              <p className="text-xs text-muted-foreground">
                {ready
                  ? "Tudo pronto. O Bot passa a responder os contatos no WhatsApp."
                  : "Conclua as etapas para ativar o Bot."}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Apenas o responsável pelo negócio pode ativar o Bot.
            </p>
          )}
        </>
      )}
      {bot.error && (
        <p role="alert" className="text-sm text-destructive">
          {bot.error}
        </p>
      )}
    </DashboardRailSection>
  );
}
