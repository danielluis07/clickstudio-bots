"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { useTRPC } from "@/trpc/client";

type Trpc = ReturnType<typeof useTRPC>;
type Conversation = inferOutput<Trpc["conversations"]["get"]>;
type ConversationList = InfiniteData<inferOutput<Trpc["conversations"]["list"]>>;

export const useDeleteContact = (onDeleted: () => void) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(trpc.contacts.delete.mutationOptions({
    onSuccess: async (_result, { contactId }) => {
      await queryClient.cancelQueries(trpc.conversations.pathFilter());
      const conversations = [
        ...queryClient.getQueriesData<Conversation>(trpc.conversations.get.pathFilter()).flatMap(([, found]) => found ? [found] : []),
        ...queryClient.getQueriesData<ConversationList>(trpc.conversations.list.pathFilter())
          .flatMap(([, list]) => list?.pages.flatMap((page) => page.conversations) ?? []),
      ];
      const ids = new Set(conversations.filter(({ contact }) => contact.id === contactId).map(({ id }) => id));
      onDeleted();
      for (const conversationId of ids) {
        queryClient.removeQueries(trpc.conversations.get.queryFilter({ conversationId }));
        queryClient.removeQueries(trpc.conversations.messages.infiniteQueryFilter({ conversationId }));
      }
      queryClient.setQueriesData<ConversationList>(trpc.conversations.list.pathFilter(), (list) => list && {
        ...list,
        pages: list.pages.map((page) => ({ ...page, conversations: page.conversations.filter(({ contact }) => contact.id !== contactId) })),
      });
      await queryClient.invalidateQueries(trpc.conversations.list.pathFilter());
    },
  }));
};
