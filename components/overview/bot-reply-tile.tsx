"use client";

import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { BotReplyMeter } from "@/components/overview/bot-reply-meter";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotUsage } from "@/modules/bot/hooks";

export function BotReplyTile() {
  const usage = useBotUsage();
  if (usage.data) return <BotReplyMeter usage={usage.data} />;
  return (
    <DashboardRailSection title="Respostas do Bot">
      {usage.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <p className="text-sm text-muted-foreground">Não foi possível consultar o uso do Bot.</p>
      )}
    </DashboardRailSection>
  );
}
