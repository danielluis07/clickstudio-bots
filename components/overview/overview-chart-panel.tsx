import type { ReactNode } from "react";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";

// One tab of the home page's chart: what it shows, then the chart, its
// loading placeholder or why it is empty.
export function OverviewChartPanel({
  value,
  description,
  loading,
  empty,
  children,
}: {
  value: string;
  description: string;
  loading: boolean;
  // The empty-state text, or a falsy value when there is data to chart.
  empty: ReactNode;
  children: ReactNode;
}) {
  return (
    <TabsContent value={value} className="flex flex-col gap-3 p-4">
      <p className="text-xs text-muted-foreground">{description}</p>
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : empty ? (
        <OverviewEmpty className="h-72">{empty}</OverviewEmpty>
      ) : (
        children
      )}
    </TabsContent>
  );
}
