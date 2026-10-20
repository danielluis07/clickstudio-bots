import "server-only"; // <-- ensure this file cannot be imported from the client
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { cache } from "react";
import { db } from "@/db";
import { getCurrentSession } from "@/server/auth/guards";
import { makeQueryClient } from "@/trpc/query-client";
import { appRouter } from "@/server/trpc/router";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);
const createTRPCContext = cache(async () => ({ db, session: await getCurrentSession() }));
export const trpc = createTRPCOptionsProxy({
  ctx: createTRPCContext,
  router: appRouter,
  queryClient: getQueryClient,
});

// Server caller for data NO client query exists for — nothing calls
// `useSuspenseQuery` on it, so there is nothing to hydrate. Detached from the
// query client on purpose: anything fetched through `getQueryClient` is
// dehydrated by <HydrateClient> and shipped to the browser whether or not a
// client component reads it.
export const caller = appRouter.createCaller(createTRPCContext);

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}
