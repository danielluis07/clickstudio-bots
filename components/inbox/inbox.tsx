import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { InboxSkeleton } from "@/components/inbox/inbox-skeleton";
import { SharedInbox } from "@/components/inbox/shared-inbox";
import type { TenantScope } from "@/modules/tenancy";
import { TRPCReactProvider } from "@/trpc/client";
import { HydrateClient, load, trpc } from "@/trpc/server";

export async function Inbox({ scope }: { scope: TenantScope }) {
  // useQuery renders loading states without suspending. Resolve the initial
  // cache before hydration so server and browser render the same list.
  await load(trpc.conversations.list.queryOptions({ search: "" }));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Caixa de entrada</h1>
        <Button variant="outline" render={<Link href="/painel" />}>Visão geral</Button>
      </div>
      <TRPCReactProvider key={`${scope.tenantId}:${scope.memberId}`}>
        <Suspense fallback={<InboxSkeleton />}>
          <HydrateClient><SharedInbox /></HydrateClient>
        </Suspense>
      </TRPCReactProvider>
    </div>
  );
}
