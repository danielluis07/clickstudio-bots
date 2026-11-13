"use client";

import { BotReplyWarning } from "@/components/overview/bot-reply-warning";
import { OverviewCharts } from "@/components/overview/overview-charts";
import { OverviewError } from "@/components/overview/overview-error";
import { StatTile } from "@/components/overview/stat-tile";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatCount } from "@/lib/format";
import {
  botOnlyShare,
  parseStatsPeriod,
  useConversationStats,
} from "@/modules/conversations/hooks";

// The stat ribbon and the charts for the period in the URL. The Bot reply
// meter lives in the rail, since it always counts the calendar month.
export function OverviewStats({ isOwner }: { isOwner: boolean }) {
  const [value] = useSearchParam("periodo", { history: "replace" });
  const period = parseStatsPeriod(value);
  const { data: stats, isError } = useConversationStats(period);
  const share = stats ? botOnlyShare(stats) : null;

  return (
    <>
      {isError && !stats && <OverviewError />}
      {isOwner && <BotReplyWarning />}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        <StatTile
          label="Conversas ativas"
          value={stats ? formatCount(stats.activeConversations) : null}
        />
        <StatTile
          label="Atendidas só pelo Bot"
          value={stats ? (share === null ? "—" : `${share}%`) : null}
          caption={
            stats &&
            `${formatCount(stats.botOnlyConversations)} de ${formatCount(stats.activeConversations)} conversas`
          }
          highlight
        />
        <StatTile
          label="Com Handoff"
          value={stats ? formatCount(stats.activeConversations - stats.botOnlyConversations) : null}
        />
        <StatTile label="Contatos novos" value={stats ? formatCount(stats.newContacts) : null} />
      </dl>
      <OverviewCharts stats={stats} />
    </>
  );
}
