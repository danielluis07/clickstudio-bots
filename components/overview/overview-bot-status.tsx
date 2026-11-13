"use client";

import { cn } from "cn";
import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { FirstSteps } from "@/components/overview/first-steps";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotActivation } from "@/modules/bot/hooks";

// The top of the rail: "Primeiros passos" while the Bot is not live, then
// whether it is answering, with the owner's pause control.
export function OverviewBotStatus({ isOwner }: { isOwner: boolean }) {
  const bot = useBotActivation();
  const status = bot.status.data;

  if (status && !status.enabled) return <FirstSteps isOwner={isOwner} />;

  return (
    <DashboardRailSection title="Bot">
      {!status ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                status.paused ? "bg-amber-500" : "bg-emerald-500",
              )}
            />
            {status.paused ? "Pausado" : "Respondendo os contatos"}
          </p>
          {isOwner && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bot.pending}
              onClick={bot.togglePause}
              aria-pressed={status.paused}
            >
              {status.paused ? "Retomar Bot" : "Pausar Bot"}
            </Button>
          )}
        </div>
      )}
      {bot.error && (
        <p role="alert" className="text-sm text-destructive">
          {bot.error}
        </p>
      )}
    </DashboardRailSection>
  );
}
