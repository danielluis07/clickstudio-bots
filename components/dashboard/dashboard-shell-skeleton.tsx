import { ContentSkeleton } from "@/components/app-shell/content-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardShellSkeleton() {
  return (
    <div className="flex min-h-svh w-full" aria-busy="true" aria-label="Carregando painel">
      <Skeleton className="hidden w-64 shrink-0 rounded-none md:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-border px-4 sm:px-6">
          <Skeleton className="size-7" />
        </div>
        <div className="px-4 py-8 sm:px-6">
          <ContentSkeleton />
        </div>
      </div>
    </div>
  );
}
