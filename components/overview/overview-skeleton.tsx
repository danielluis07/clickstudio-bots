import { Skeleton } from "@/components/ui/skeleton";

// The home page's two panes while it loads, so nothing shifts on arrival.
export function OverviewSkeleton() {
  return (
    <div
      className="-mx-4 -my-8 flex min-h-[calc(100svh-3.5rem)] flex-col sm:-mx-6 lg:flex-row"
      aria-busy="true"
      aria-label="Carregando"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-8 w-52" />
        </div>
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
      <div className="flex w-full shrink-0 flex-col gap-5 border-t p-5 lg:w-80 lg:border-t-0 lg:border-l xl:w-96">
        <Skeleton className="h-32" />
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
