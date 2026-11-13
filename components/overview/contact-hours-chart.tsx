"use client";

import { Bar, BarChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { BusinessHours } from "@/modules/bot";
import type { HourlyContactMessages } from "@/modules/conversations";
import { formatStatsHour, openHourBands } from "@/modules/conversations/hooks";

const config = {
  messages: { label: "Mensagens", color: "var(--brand)" },
} satisfies ChartConfig;

// Contact messages by São Paulo hour, over the Tenant's Business hours: the
// more weekdays an hour is open, the stronger its shading.
export function ContactHoursChart({
  hours,
  businessHours,
}: {
  hours: HourlyContactMessages[];
  businessHours: BusinessHours;
}) {
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={hours} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        {openHourBands(businessHours).map((band) => (
          <ReferenceArea
            key={band.from}
            x1={band.from}
            x2={band.to}
            fill="var(--muted-foreground)"
            fillOpacity={0.04 + (band.days / 7) * 0.12}
            strokeOpacity={0}
            ifOverflow="extendDomain"
          />
        ))}
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={2}
          tickFormatter={formatStatsHour}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const hour = Number(payload[0]?.payload?.hour ?? 0);
                return `${formatStatsHour(hour)} – ${formatStatsHour((hour + 1) % 24)}`;
              }}
            />
          }
        />
        <Bar dataKey="messages" fill="var(--color-messages)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
