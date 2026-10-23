"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { handoffMutationOptions } from "@/modules/conversations/hooks/handoff-cache";
import { useTRPC } from "@/trpc/client";

// "Assumir", "Devolver ao Bot" and "Resolvida" for one Conversation. Each
// shows its outcome at once in the Conversation and the list, restores them
// if the server refuses, and then refetches both.
export const useHandoffControls = (conversationId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = (command: "takeOver" | "returnToBot" | "resolve") =>
    handoffMutationOptions(trpc, queryClient, command);

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
