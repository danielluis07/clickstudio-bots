"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cachedConversations,
  updateListRows,
} from "@/modules/conversations/hooks/conversation-cache";
import { useTRPC } from "@/trpc/client";

export const useDeleteContact = (onDeleted: () => void) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.contacts.delete.mutationOptions({
      onSuccess: async (_result, { contactId }) => {
        await queryClient.cancelQueries(trpc.conversations.pathFilter());
        const conversations = cachedConversations(queryClient, trpc);
        const ids = new Set(
          conversations.filter(({ contact }) => contact.id === contactId).map(({ id }) => id),
        );
        onDeleted();
        for (const conversationId of ids) {
          queryClient.removeQueries(trpc.conversations.get.queryFilter({ conversationId }));
          queryClient.removeQueries(
            trpc.conversations.messages.infiniteQueryFilter({ conversationId }),
          );
          queryClient.removeQueries(trpc.conversations.handoffs.queryFilter({ conversationId }));
        }
        updateListRows(queryClient, trpc, (rows) =>
          rows.filter(({ contact }) => contact.id !== contactId),
        );
        await queryClient.invalidateQueries(trpc.conversations.list.pathFilter());
      },
    }),
  );
};
