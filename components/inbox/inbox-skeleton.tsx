import { Skeleton } from "@/components/ui/skeleton";

export function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-5" role="status" aria-label="Carregando conversas">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
