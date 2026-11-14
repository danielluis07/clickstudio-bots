import { Skeleton } from "@/components/ui/skeleton";

type DashboardFormPageSkeletonProps = {
  // Whether the page's header has a description, which the Bot pages wrap
  // onto two lines.
  description?: boolean;
};

// A DashboardPage with width="form" and no rail while it loads: the header,
// then sections split by a rule with labels left of their fields.
export function DashboardFormPageSkeleton({ description = true }: DashboardFormPageSkeletonProps) {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-5" aria-busy="true" aria-label="Carregando">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-40" />
        {description && (
          <div className="flex h-10 max-w-2xl flex-col justify-center gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
      </div>
      <div className="flex flex-col">
        {[0, 1].map((section) => (
          <div
            key={section}
            className="flex flex-col gap-4 border-t py-6 first:border-t-0 first:pt-2"
          >
            <Skeleton className="h-5 w-32" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <Skeleton className="h-5 w-24 sm:mt-2" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
