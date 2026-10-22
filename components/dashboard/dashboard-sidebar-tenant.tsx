"use client";

import { Building2Icon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentTenant } from "@/modules/tenancy/hooks";

export function DashboardSidebarTenant() {
  const { data: tenant, isPending, isError } = useCurrentTenant();
  const tenantName = tenant?.name ?? (isError ? "Negócio indisponível" : "Seu negócio");

  return (
    <div
      className="flex h-12 min-w-0 items-center gap-2 overflow-hidden px-2"
      aria-busy={isPending}
      aria-label={isPending ? "Carregando negócio" : undefined}
      title={isPending ? undefined : tenantName}
    >
      <Building2Icon className="size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
        {isPending ? (
          <Skeleton className="my-1 h-4 w-32" />
        ) : (
          <span className="truncate font-semibold">{tenantName}</span>
        )}
        <span className="truncate text-xs text-muted-foreground">ClickStudio Bots</span>
      </div>
    </div>
  );
}
