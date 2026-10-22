import { Inbox } from "@/components/inbox/inbox";
import { nextPageCursor } from "@/modules/conversations/hooks";
import { HydrateClient, prefetch, prefetchInfinite, trpc } from "@/trpc/server";

// Loads what the URL asks for before the first render; the browser cache then
// keeps it fresh. Rendered only after the page's guard.
export async function PrefetchedInbox({
  search,
  waiting,
  conversationId,
  historyNotImported,
  canDeleteContacts,
}: {
  search: string;
  waiting: boolean;
  conversationId: string;
  historyNotImported: boolean;
  canDeleteContacts: boolean;
}) {
  await Promise.all([
    prefetchInfinite(
      trpc.conversations.list.infiniteQueryOptions(
        { search, waiting },
        { getNextPageParam: nextPageCursor },
      ),
    ),
    ...(conversationId
      ? [
          prefetch(trpc.conversations.get.queryOptions({ conversationId })),
          prefetchInfinite(
            trpc.conversations.messages.infiniteQueryOptions(
              { conversationId },
              { getNextPageParam: nextPageCursor },
            ),
          ),
        ]
      : []),
  ]);

  return (
    <HydrateClient>
      <Inbox historyNotImported={historyNotImported} canDeleteContacts={canDeleteContacts} />
    </HydrateClient>
  );
}
