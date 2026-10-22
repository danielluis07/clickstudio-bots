"use client";

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { useTRPC } from "@/trpc/client";

type Trpc = ReturnType<typeof useTRPC>;
type Conversation = inferOutput<Trpc["conversations"]["get"]>;
type ConversationList = InfiniteData<inferOutput<Trpc["conversations"]["list"]>>;
type Ownership = Pick<Conversation, "owner" | "handoffReason" | "waiting">;

// What each control does to ownership, mirroring the server's commands.
const changes = {
  takeOver: (found: Ownership): Ownership =>
    found.owner === "bot" ? { owner: "team", handoffReason: "assumida", waiting: true } : found,
  returnToBot: (found: Ownership): Ownership => ({ ...found, owner: "bot" }),
  resolve: (): Ownership => ({ owner: "bot", handoffReason: null, waiting: false }),
};

// "Assumir", "Devolver ao Bot" and "Resolvida" for one Conversation. Each
// shows its outcome at once in the Conversation and the list, restores them
// if the server refuses, and then refetches both.
export const useHandoffControls = (conversationId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const affected = [
    trpc.conversations.get.queryFilter({ conversationId }),
    trpc.conversations.list.pathFilter(),
  ];

  const options = (command: keyof typeof changes) => ({
    onMutate: async () => {
      await Promise.all(affected.map((filter) => queryClient.cancelQueries(filter)));
      const previous = affected.flatMap((filter) => queryClient.getQueriesData(filter));
      const change = <T extends Ownership & { id: string }>(found: T): T =>
        found.id === conversationId ? { ...found, ...changes[command](found) } : found;

      queryClient.setQueriesData<Conversation>(
        trpc.conversations.get.queryFilter({ conversationId }),
        (found) => found && change(found),
      );
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
    onSettled: () => Promise.all(affected.map((filter) => queryClient.invalidateQueries(filter))),
  });

  const mutations = {
    takeOver: useMutation(trpc.handoff.takeOver.mutationOptions(options("takeOver"))),
    returnToBot: useMutation(trpc.handoff.returnToBot.mutationOptions(options("returnToBot"))),
    resolve: useMutation(trpc.handoff.resolve.mutationOptions(options("resolve"))),
  };
  const all = Object.values(mutations);

  // Only the latest control's failure stays on screen.
  const run = (command: keyof typeof mutations) => () => {
    for (const mutation of all) mutation.reset();
    mutations[command].mutate({ conversationId });
  };

  return {
    takeOver: run("takeOver"),
    returnToBot: run("returnToBot"),
    resolve: run("resolve"),
    pending: all.some((mutation) => mutation.isPending),
    failed: all.some((mutation) => mutation.isError),
  };
};
