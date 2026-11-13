import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { OverviewPeriod } from "@/components/overview/overview-period";
import { OverviewRail } from "@/components/overview/overview-rail";
import { OverviewStats } from "@/components/overview/overview-stats";
import type { TenantScope } from "@/modules/tenancy";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// The home page. Rendered only after the page's guard: the prefetches let
// the rail ("Primeiros passos", the reply meter) render without shifting.
export async function TenantOverview({ scope }: { scope: TenantScope }) {
  const isOwner = scope.role === "owner";
  await Promise.all([
    prefetch(trpc.bot.status.queryOptions()),
    ...(isOwner
      ? [prefetch(trpc.bot.usage.queryOptions()), prefetch(trpc.channels.status.queryOptions())]
      : []),
  ]);

  return (
    <HydrateClient>
      <DashboardPage
        title="Visão geral"
        actions={<OverviewPeriod />}
        rail={<OverviewRail isOwner={isOwner} />}
        railLabel="Bot e equipe"
      >
        <OverviewStats isOwner={isOwner} />
      </DashboardPage>
    </HydrateClient>
  );
}
