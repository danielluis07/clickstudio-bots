import "server-only"; // <-- ensure this file cannot be imported from the client
import {
  dehydrate,
  HydrationBoundary,
  type InfiniteQueryExecuteOptions,
  type QueryExecuteOptions,
  type QueryKey,
} from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { cache } from "react";
import { getCurrentSession } from "@/server/auth/guards";
import { contextForSession } from "@/trpc/context";
import { makeQueryClient } from "@/trpc/query-client";
import { appRouter } from "@/trpc/routers/_app";

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

// Calls procedures in-process with the request's session, reusing the lookup
// the page's guard already made.
export const trpc = createTRPCOptionsProxy({
  ctx: async () => contextForSession(await getCurrentSession()),
  router: appRouter,
  queryClient: getQueryClient,
});

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return <HydrationBoundary state={dehydrate(queryClient)}>{props.children}</HydrationBoundary>;
}

// Awaited, unlike tRPC's streaming example: under Cache Components a pending
// prefetch can hide the request-time read that makes a page dynamic, and the
// build then fails to prerender it. Call it after the page's guard. A failed
// query is not dehydrated, so the browser retries it and shows the error.
export async function prefetch<TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(
  queryOptions: QueryExecuteOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
) {
  await getQueryClient().query(queryOptions).catch(ignoreError);
}

export async function prefetchInfinite<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
  TPageParam,
>(queryOptions: InfiniteQueryExecuteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>) {
  await getQueryClient().infiniteQuery(queryOptions).catch(ignoreError);
}

const ignoreError = () => {};
