"use client";

import { UserRoundIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/modules/identity/hooks";

export function SidebarUser() {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  return (
    <div
      className="flex min-w-0 max-w-48 items-center gap-2 overflow-hidden p-2 sm:max-w-64"
      aria-busy={isPending}
      aria-label={isPending ? "Carregando usuário" : undefined}
      title={user ? `${user.name} (${user.email})` : undefined}
    >
      <UserRoundIcon className="size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        {isPending ? (
          <div className="flex h-9 flex-col justify-center gap-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        ) : (
          <>
            <span className="truncate text-sm font-medium">
              {user?.name ?? "Usuário indisponível"}
            </span>
            {user ? (
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
