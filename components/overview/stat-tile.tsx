import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// One KPI in the home page's row. A null value is still loading.
export function StatTile({
  label,
  value,
  caption,
  children,
}: {
  label: string;
  value: ReactNode | null;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4">
      <dt className="truncate text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums">
        {value === null ? <Skeleton className="my-1 h-6 w-20" /> : value}
      </dd>
      {children}
      {caption !== undefined && (
        <dd className="truncate text-xs text-muted-foreground tabular-nums">{caption}</dd>
      )}
    </div>
  );
}
