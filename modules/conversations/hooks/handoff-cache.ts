import type { QueryClient } from "@tanstack/react-query";
import {
  patchConversationCaches,
  rollback,
  type Conversation,
  type Snapshot,
  type Trpc,
} from "@/modules/conversations/hooks/conversation-cache";

type Ownership = Pick<Conversation, "owner" | "handoffReason" | "waiting">;
type HandoffInput = { conversationId: string } | { conversationIds: string[] };

// What each control does to ownership, mirroring the server's commands.
const changes = {
  takeOver: (found: Ownership): Ownership =>
    found.owner === "bot" ? { owner: "team", handoffReason: "claimed", waiting: true } : found,
  returnToBot: (found: Ownership): Ownership => ({ ...found, owner: "bot" }),
  resolve: (): Ownership => ({
    owner: "bot",
    handoffReason: null,
    waiting: false,
  }),
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
    onMutate: (input: HandoffInput) => {
      const ids = new Set(conversationIdsOf(input));
      const change = <T extends Ownership & { id: string }>(found: T): T =>
        ids.has(found.id) ? { ...found, ...changes[command](found) } : found;

      return patchConversationCaches(queryClient, trpc, {
        filters: [...ids].map((conversationId) =>
          trpc.conversations.get.queryFilter({ conversationId }),
        ),
        patch: change,
        patchRow: change,
      });
    },
    onError: (_error: unknown, _input: unknown, context: { previous: Snapshot } | undefined) =>
      rollback(queryClient, context?.previous),
    // Every control can change hands, which the thread's dividers show, so
    // they refetch too.
    onSettled: (_data: unknown, _error: unknown, input: HandoffInput) =>
      Promise.all(
        [
          ...affected(input),
          ...conversationIdsOf(input).map((conversationId) =>
            trpc.conversations.handoffs.queryFilter({ conversationId }),
          ),
        ].map((filter) => queryClient.invalidateQueries(filter)),
      ),
  };
};
