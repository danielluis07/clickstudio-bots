import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { FirstSteps } from "@/components/overview/first-steps";
import { OverviewPeriod } from "@/components/overview/overview-period";
import { OverviewStats } from "@/components/overview/overview-stats";
import type { TenantScope } from "@/modules/tenancy";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// The home page. Rendered only after the page's guard: the prefetches let
// "Primeiros passos" and the reply meter render without shifting the page.
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
      <DashboardPage title="Visão geral" titleHidden actions={<OverviewPeriod />}>
        <FirstSteps isOwner={isOwner} />
        <OverviewStats isOwner={isOwner} />
      </DashboardPage>
    </HydrateClient>
  );
}
