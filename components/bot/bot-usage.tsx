"use client";

import { BotUsageSummary } from "@/components/bot/bot-usage-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotUsage } from "@/modules/bot/hooks";

export function BotUsage() {
  const usage = useBotUsage();
  if (usage.isPending) return <Skeleton className="h-5 w-72 max-w-full" />;
  if (!usage.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Não foi possível consultar o uso do Bot. Tente novamente mais tarde.
      </p>
    );
  return <BotUsageSummary usage={usage.data} />;
}
