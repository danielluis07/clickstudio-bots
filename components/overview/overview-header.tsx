"use client";

import { PeriodSelector } from "@/components/overview/period-selector";
import { useSearchParam } from "@/hooks/use-search-param";
import { parseStatsPeriod } from "@/modules/conversations/hooks";

// The Tenant's name and the period every widget except the reply meter follows.
export function OverviewHeader({ tenantName }: { tenantName: string }) {
  const [value, setValue] = useSearchParam("periodo", { history: "replace" });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 text-lg font-medium tracking-tight wrap-break-word">{tenantName}</h1>
      <PeriodSelector period={parseStatsPeriod(value)} onPeriod={setValue} />
    </div>
  );
}
