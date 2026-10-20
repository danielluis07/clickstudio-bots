import "server-only"; // <-- ensure this file cannot be imported from the client
import {
  createTRPCOptionsProxy,
  TRPCQueryOptions,
} from "@trpc/tanstack-react-query";
import { cache } from "react";
import { db } from "@/db";
import { getCurrentSession } from "@/server/auth/guards";
import { makeQueryClient } from "@/trpc/query-client";
import { appRouter } from "@/server/trpc/router";
import {
  dehydrate,
  HydrationBoundary,
  type DefaultError,
  type QueryExecuteOptions,
  type QueryKey,
} from "@tanstack/react-query";
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

const noop = () => {};

/**
 * Warm the cache for a query a client component will read, without waiting for
 * it. The page streams; the client's `useSuspenseQuery` picks the result up
 * from the dehydrated cache. Errors are swallowed here on purpose — they
 * surface on the client, where a boundary can render them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
) {
  const queryClient = getQueryClient();
  if (queryOptions.queryKey[1]?.type === "infinite") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void queryClient.infiniteQuery(queryOptions as any).catch(noop);
  } else {
    void queryClient.query(queryOptions).catch(noop);
  }
}

/**
 * Same fetch as `prefetch`, but awaited and returned: use it when the server
 * component itself needs the value *and* a client component reads the same
 * query. One request serves both — the cache is populated for hydration and
 * the data is handed back. Throws, so `notFound()` and friends stay in the
 * page.
 *
 * It is typed as the QueryClient's own `query` rather than through
 * `prefetch`'s constraint above, and it has to be: `TRPCQueryOptions<any>`
 * erases the procedure's output, which costs a caller that ignores the result
 * nothing and hands a caller that reads one a `{}`.
 */
export function load<
  TQueryFnData,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryOptions: QueryExecuteOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >,
): Promise<TData> {
  return getQueryClient().query(queryOptions);
}
