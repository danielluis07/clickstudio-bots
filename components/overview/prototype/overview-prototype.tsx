// PROTOTYPE (throwaway): three home-page designs plus the current one,
// switchable with ?variant=atual|a|b|c on /painel. Data loading is the real
// one; only the rendering changes.
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { FirstSteps } from "@/components/overview/first-steps";
import { OverviewPeriod } from "@/components/overview/overview-period";
import { OverviewStats } from "@/components/overview/overview-stats";
import { OverviewVariantA } from "@/components/overview/prototype/overview-variant-a";
import { OverviewVariantB } from "@/components/overview/prototype/overview-variant-b";
import { OverviewVariantC } from "@/components/overview/prototype/overview-variant-c";
import { PrototypeVariants } from "@/components/prototype/prototype-variants";
import type { TenantScope } from "@/modules/tenancy";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

export async function OverviewPrototype({ scope }: { scope: TenantScope }) {
  const isOwner = scope.role === "owner";
  await Promise.all([
    prefetch(trpc.bot.status.queryOptions()),
    ...(isOwner
      ? [prefetch(trpc.bot.usage.queryOptions()), prefetch(trpc.channels.status.queryOptions())]
      : []),
  ]);

  return (
    <HydrateClient>
      <PrototypeVariants
        variants={[
          { key: "a", name: "Relatório", content: <OverviewVariantA isOwner={isOwner} /> },
          { key: "b", name: "Bento", content: <OverviewVariantB isOwner={isOwner} /> },
          { key: "c", name: "Bancada", content: <OverviewVariantC isOwner={isOwner} /> },
          {
            key: "atual",
            name: "Atual",
            content: (
              <DashboardPage title="Visão geral" titleHidden actions={<OverviewPeriod />}>
                <FirstSteps isOwner={isOwner} />
                <OverviewStats isOwner={isOwner} />
              </DashboardPage>
            ),
          },
        ]}
      />
    </HydrateClient>
  );
}
