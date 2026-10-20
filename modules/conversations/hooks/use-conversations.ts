"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { nextPageCursor, retryUnlessNotFound } from "@/modules/conversations/hooks/paging";
import { useTRPC } from "@/trpc/client";

// The Tenant's Conversations, most recent activity first. While a new search
// loads, the previous results stay on screen.
export const useConversationList = (search: string) => {
  const trpc = useTRPC();
  const query = useInfiniteQuery(trpc.conversations.list.infiniteQueryOptions(
    { search },
    { getNextPageParam: nextPageCursor, placeholderData: keepPreviousData },
  ));
  return {
    conversations: query.data?.pages.flatMap((page) => page.conversations) ?? [],
    isPending: query.isPending,
    isError: query.isError,
    hasMore: query.hasNextPage,
    loadMore: () => query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
  };
};

export const useConversation = (conversationId: string) => {
  const trpc = useTRPC();
  return useQuery(trpc.conversations.get.queryOptions({ conversationId }, { retry: retryUnlessNotFound }));
};

// The latest messages in the order they were sent, with older ones loaded on
// request and placed before them.
export const useConversationMessages = (conversationId: string) => {
  const trpc = useTRPC();
  const query = useInfiniteQuery(trpc.conversations.messages.infiniteQueryOptions(
    { conversationId },
    { getNextPageParam: nextPageCursor, retry: retryUnlessNotFound },
  ));
  return {
    messages: query.data?.pages.slice().reverse().flatMap((page) => page.messages) ?? [],
    isPending: query.isPending,
    isError: query.isError,
    hasOlder: query.hasNextPage,
    loadOlder: () => query.fetchNextPage(),
    isLoadingOlder: query.isFetchingNextPage,
  };
};
