"use client";

import { PeriodSelector } from "@/components/overview/period-selector";
import { useSearchParam } from "@/hooks/use-search-param";
import { parseStatsPeriod } from "@/modules/conversations/hooks";

// The period every widget except the reply meter follows.
export function OverviewPeriod() {
  const [value, setValue] = useSearchParam("periodo", { history: "replace" });
  return <PeriodSelector period={parseStatsPeriod(value)} onPeriod={setValue} />;
}
