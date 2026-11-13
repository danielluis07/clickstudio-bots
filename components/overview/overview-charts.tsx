"use client";

import { ContactHoursChart } from "@/components/overview/contact-hours-chart";
import { ConversationsChart } from "@/components/overview/conversations-chart";
import { OverviewChartPanel } from "@/components/overview/overview-chart-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConversationStats } from "@/modules/conversations";
import { hasActiveConversations, hasContactMessages } from "@/modules/conversations/hooks";

// One chart at a time, picked by tab, instead of a stack of chart cards.
export function OverviewCharts({ stats }: { stats: ConversationStats | undefined }) {
  return (
    <Tabs defaultValue="daily" className="gap-0 rounded-lg border bg-card">
      <TabsList variant="line" className="h-auto w-full justify-start gap-4 border-b px-4">
        <TabsTrigger value="daily" className="flex-none px-0 py-3">
          Conversas ativas por dia
        </TabsTrigger>
        <TabsTrigger value="hourly" className="flex-none px-0 py-3">
          Mensagens dos contatos por horário
        </TabsTrigger>
      </TabsList>
      <OverviewChartPanel
        value="daily"
        description="Só com o Bot ou com Handoff para a equipe."
        loading={!stats}
        empty={stats && !hasActiveConversations(stats) && "Nenhuma conversa ativa no período."}
      >
        {stats && <ConversationsChart daily={stats.daily} />}
      </OverviewChartPanel>
      <OverviewChartPanel
        value="hourly"
        description="Horário de São Paulo. A faixa sombreada é o horário de atendimento."
        loading={!stats}
        empty={stats && !hasContactMessages(stats) && "Nenhuma mensagem de contato no período."}
      >
        {stats && (
          <ContactHoursChart
            hours={stats.contactMessagesByHour}
            businessHours={stats.businessHours}
          />
        )}
      </OverviewChartPanel>
    </Tabs>
  );
}
