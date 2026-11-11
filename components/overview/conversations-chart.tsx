"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DailyConversations } from "@/modules/conversations";
import { formatStatsDay, formatStatsDayLong } from "@/modules/conversations/hooks";

const config = {
  botOnly: { label: "Só Bot", color: "var(--brand)" },
  withHandoff: {
    label: "Com Handoff",
    theme: { light: "oklch(0.85 0 0)", dark: "oklch(0.42 0 0)" },
  },
} satisfies ChartConfig;

// Active Conversations per day, stacked by whether any had a Handoff.
export function ConversationsChart({ daily }: { daily: DailyConversations[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={daily} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={formatStatsDay}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                formatStatsDayLong(String(payload[0]?.payload?.date ?? ""))
              }
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="botOnly" stackId="day" fill="var(--color-botOnly)" />
        <Bar
          dataKey="withHandoff"
          stackId="day"
          fill="var(--color-withHandoff)"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
