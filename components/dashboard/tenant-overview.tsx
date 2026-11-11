import { FirstSteps } from "@/components/overview/first-steps";
import { OverviewHeader } from "@/components/overview/overview-header";
import { OverviewStats } from "@/components/overview/overview-stats";
import { db } from "@/db";
import { createTenantRepository } from "@/modules/tenancy";
import type { TenantScope } from "@/modules/tenancy";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// The home page. Rendered only after the page's guard: the prefetches let
// "Primeiros passos" and the reply meter render without shifting the page.
export async function TenantOverview({ scope }: { scope: TenantScope }) {
  const isOwner = scope.role === "owner";
  const [profile] = await Promise.all([
    createTenantRepository(db, scope).getTenant(),
    prefetch(trpc.bot.status.queryOptions()),
    ...(isOwner
      ? [prefetch(trpc.bot.usage.queryOptions()), prefetch(trpc.channels.status.queryOptions())]
      : []),
  ]);

  return (
    <HydrateClient>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <OverviewHeader tenantName={profile?.name ?? ""} />
        <FirstSteps isOwner={isOwner} />
        <OverviewStats isOwner={isOwner} />
      </div>
    </HydrateClient>
  );
}
