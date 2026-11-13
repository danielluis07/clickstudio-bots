"use client";

import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";
import { BotReplyTile } from "@/components/overview/bot-reply-tile";
import { LatestHandoffs } from "@/components/overview/latest-handoffs";
import { OverviewBotStatus } from "@/components/overview/overview-bot-status";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParam } from "@/hooks/use-search-param";
import { parseStatsPeriod, useConversationStats } from "@/modules/conversations/hooks";

// The home page's right rail: the Bot's state (or its setup), this month's
// replies for the owner, and the newest Handoffs.
export function OverviewRail({ isOwner }: { isOwner: boolean }) {
  const [value] = useSearchParam("periodo", { history: "replace" });
  const { data: stats, dataUpdatedAt } = useConversationStats(parseStatsPeriod(value));

  return (
    <>
      <OverviewBotStatus isOwner={isOwner} />
      {isOwner && <BotReplyTile />}
      <DashboardRailSection title="Últimos Handoffs">
        {stats ? (
          <LatestHandoffs handoffs={stats.latestHandoffs} now={new Date(dataUpdatedAt)} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </DashboardRailSection>
    </>
  );
}
