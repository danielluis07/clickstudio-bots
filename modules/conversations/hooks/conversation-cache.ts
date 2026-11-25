import type { InfiniteData, QueryClient, QueryFilters, QueryKey } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { useTRPC } from "@/trpc/client";

export type Trpc = ReturnType<typeof useTRPC>;
export type Conversation = inferOutput<Trpc["conversations"]["get"]>;
export type ConversationList = InfiniteData<inferOutput<Trpc["conversations"]["list"]>>;
export type ConversationRow = ConversationList["pages"][number]["conversations"][number];
export type Snapshot = [QueryKey, unknown][];

// Applies `change` to every Conversation row of every cached list page.
export const updateListRows = (
  queryClient: QueryClient,
  trpc: Trpc,
  change: (rows: ConversationRow[]) => ConversationRow[],
) => {
  queryClient.setQueriesData<ConversationList>(
    trpc.conversations.list.pathFilter(),
    (list) =>
      list && {
        ...list,
        pages: list.pages.map((page) => ({
          ...page,
          conversations: change(page.conversations),
        })),
      },
  );
};

// Every Conversation currently held by the `get` and `list` caches.
export const cachedConversations = (queryClient: QueryClient, trpc: Trpc) => [
  ...queryClient
    .getQueriesData<Conversation>(trpc.conversations.get.pathFilter())
    .flatMap(([, found]) => (found ? [found] : [])),
  ...queryClient
    .getQueriesData<ConversationList>(trpc.conversations.list.pathFilter())
    .flatMap(([, list]) => list?.pages.flatMap((page) => page.conversations) ?? []),
];

type Patch = {
  // The `get` entries to patch; the list pages are always patched.
  filters: QueryFilters[];
  patch: (found: Conversation) => Conversation;
  // The same change for a list row, which carries fewer fields than an open Conversation.
  patchRow: (row: ConversationRow) => ConversationRow;
};

// Optimistically patches the open Conversations and the list: cancels in-flight
// queries, saves a snapshot, applies the patch and returns the snapshot for
// `rollback`.
export const patchConversationCaches = async (
  queryClient: QueryClient,
  trpc: Trpc,
  { filters, patch, patchRow }: Patch,
): Promise<{ previous: Snapshot }> => {
  const affected = [...filters, trpc.conversations.list.pathFilter()];
  await Promise.all(affected.map((filter) => queryClient.cancelQueries(filter)));
  const previous = affected.flatMap((filter) => queryClient.getQueriesData(filter));

  for (const filter of filters) {
    queryClient.setQueriesData<Conversation>(filter, (found) => found && patch(found));
  }
  updateListRows(queryClient, trpc, (rows) => rows.map(patchRow));
  return { previous };
};

// Restores a snapshot taken by `patchConversationCaches` after a refusal.
export const rollback = (queryClient: QueryClient, previous: Snapshot | undefined) => {
  previous?.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
};
