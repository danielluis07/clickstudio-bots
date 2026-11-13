import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// One KPI in the home page's stat ribbon. A null value is still loading.
export function StatTile({
  label,
  value,
  caption,
  highlight = false,
}: {
  label: string;
  value: ReactNode | null;
  caption?: ReactNode;
  // The ribbon's headline figure, in the brand colour.
  highlight?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-xl font-semibold tracking-tight tabular-nums",
          highlight && "text-brand",
        )}
      >
        {value === null ? <Skeleton className="my-0.5 h-6 w-14" /> : value}
      </dd>
      {caption !== undefined && (
        <dd className="truncate text-xs text-muted-foreground tabular-nums">{caption}</dd>
      )}
    </div>
  );
}
