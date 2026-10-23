import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { useTRPC } from "@/trpc/client";

type Trpc = ReturnType<typeof useTRPC>;
type Conversation = inferOutput<Trpc["conversations"]["get"]>;
type ConversationList = InfiniteData<inferOutput<Trpc["conversations"]["list"]>>;
type Ownership = Pick<Conversation, "owner" | "handoffReason" | "waiting">;
type HandoffInput = { conversationId: string } | { conversationIds: string[] };

// What each control does to ownership, mirroring the server's commands.
const changes = {
  takeOver: (found: Ownership): Ownership =>
    found.owner === "bot" ? { owner: "team", handoffReason: "assumida", waiting: true } : found,
  returnToBot: (found: Ownership): Ownership => ({ ...found, owner: "bot" }),
  resolve: (): Ownership => ({ owner: "bot", handoffReason: null, waiting: false }),
};

const conversationIdsOf = (input: HandoffInput) =>
  "conversationIds" in input ? input.conversationIds : [input.conversationId];

// Single and bulk controls share optimistic ownership changes, rollback and
// reconciliation. Callbacks use the submitted IDs, even after selection clears.
export const handoffMutationOptions = (
  trpc: Trpc,
  queryClient: QueryClient,
  command: keyof typeof changes,
) => {
  const affected = (input: HandoffInput) => [
    ...conversationIdsOf(input).map((conversationId) =>
      trpc.conversations.get.queryFilter({ conversationId }),
    ),
    trpc.conversations.list.pathFilter(),
  ];

  return {
    onMutate: async (input: HandoffInput) => {
      const filters = affected(input);
      const ids = new Set(conversationIdsOf(input));
      await Promise.all(filters.map((filter) => queryClient.cancelQueries(filter)));
      const previous = filters.flatMap((filter) => queryClient.getQueriesData(filter));
      const change = <T extends Ownership & { id: string }>(found: T): T =>
        ids.has(found.id) ? { ...found, ...changes[command](found) } : found;

      for (const conversationId of ids) {
        queryClient.setQueriesData<Conversation>(
          trpc.conversations.get.queryFilter({ conversationId }),
          (found) => found && change(found),
        );
      }
      queryClient.setQueriesData<ConversationList>(
        trpc.conversations.list.pathFilter(),
        (list) =>
          list && {
            ...list,
            pages: list.pages.map((page) => ({
              ...page,
              conversations: page.conversations.map(change),
            })),
          },
      );
      return { previous };
    },
    onError: (
      _error: unknown,
      _input: unknown,
      context: { previous: [QueryKey, unknown][] } | undefined,
    ) => {
      context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
    },
    onSettled: (_data: unknown, _error: unknown, input: HandoffInput) =>
      Promise.all(affected(input).map((filter) => queryClient.invalidateQueries(filter))),
  };
};
