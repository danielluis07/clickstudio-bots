"use client";

import { cn } from "cn";
import { BotReplyTile } from "@/components/overview/bot-reply-tile";
import { BotReplyWarning } from "@/components/overview/bot-reply-warning";
import { ContactHoursChart } from "@/components/overview/contact-hours-chart";
import { ConversationsChart } from "@/components/overview/conversations-chart";
import { LatestHandoffs } from "@/components/overview/latest-handoffs";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import { OverviewError } from "@/components/overview/overview-error";
import { OverviewPanel } from "@/components/overview/overview-panel";
import { StatTile } from "@/components/overview/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatCount } from "@/lib/format";
import {
  botOnlyShare,
  hasActiveConversations,
  hasContactMessages,
  parseStatsPeriod,
  useConversationStats,
} from "@/modules/conversations/hooks";

// The KPI row, both charts and the latest Handoffs for the period in the URL.
// The Bot reply meter is the owner's, and always counts the calendar month.
export function OverviewStats({ isOwner }: { isOwner: boolean }) {
  const [value] = useSearchParam("periodo", { history: "replace" });
  const period = parseStatsPeriod(value);
  const { data: stats, dataUpdatedAt, isError } = useConversationStats(period);
  const share = stats ? botOnlyShare(stats) : null;
  const inPeriod = `Nos últimos ${period} dias`;

  return (
    <div className="flex flex-col gap-4">
      {isError && !stats && <OverviewError />}
      <dl className={cn("grid grid-cols-2 gap-3", isOwner ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <StatTile
          label="Conversas ativas"
          value={stats ? formatCount(stats.activeConversations) : null}
          caption={inPeriod}
        />
        {isOwner && <BotReplyTile />}
        <StatTile
          label="Atendidas só pelo Bot"
          value={stats ? (share === null ? "—" : `${share}%`) : null}
          caption={
            stats
              ? `${formatCount(stats.botOnlyConversations)} de ${formatCount(stats.activeConversations)} conversas`
              : inPeriod
          }
        />
        <StatTile
          label="Contatos novos"
          value={stats ? formatCount(stats.newContacts) : null}
          caption={inPeriod}
        />
      </dl>
      {isOwner && <BotReplyWarning />}
      <OverviewPanel
        title="Conversas ativas por dia"
        description="Só com o Bot ou com Handoff para a equipe."
      >
        {!stats ? (
          <Skeleton className="h-64 w-full" />
        ) : hasActiveConversations(stats) ? (
          <ConversationsChart daily={stats.daily} />
        ) : (
          <OverviewEmpty className="h-64">Nenhuma conversa ativa no período.</OverviewEmpty>
        )}
      </OverviewPanel>
      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewPanel
          title="Mensagens dos contatos por horário"
          description="Horário de São Paulo. A faixa sombreada é o horário de atendimento."
        >
          {!stats ? (
            <Skeleton className="h-56 w-full" />
          ) : hasContactMessages(stats) ? (
            <ContactHoursChart
              hours={stats.contactMessagesByHour}
              businessHours={stats.businessHours}
            />
          ) : (
            <OverviewEmpty className="h-56">Nenhuma mensagem de contato no período.</OverviewEmpty>
          )}
        </OverviewPanel>
        <OverviewPanel title="Últimos Handoffs" description="Conversas passadas para a equipe.">
          {stats ? (
            <LatestHandoffs handoffs={stats.latestHandoffs} now={new Date(dataUpdatedAt)} />
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </OverviewPanel>
      </div>
    </div>
  );
}
