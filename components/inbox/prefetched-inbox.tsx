import { Inbox } from "@/components/inbox/inbox";
import { nextPageCursor } from "@/modules/conversations/hooks";
import { HydrateClient, prefetch, prefetchInfinite, trpc } from "@/trpc/server";

// Loads what the URL asks for before the first render; the browser cache then
// keeps it fresh. Rendered only after the page's guard.
export async function PrefetchedInbox({ search, conversationId }: { search: string; conversationId: string }) {
  await Promise.all([
    prefetchInfinite(trpc.conversations.list.infiniteQueryOptions({ search }, { getNextPageParam: nextPageCursor })),
    ...(conversationId
      ? [
        prefetch(trpc.conversations.get.queryOptions({ conversationId })),
        prefetchInfinite(trpc.conversations.messages.infiniteQueryOptions({ conversationId }, { getNextPageParam: nextPageCursor })),
      ]
      : []),
  ]);

  return (
    <HydrateClient>
      <Inbox />
    </HydrateClient>
  );
}
