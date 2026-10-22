"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export const useBotActivation = () => {
  const trpc = useTRPC();
  const client = useQueryClient();
  const status = useQuery(trpc.bot.status.queryOptions());
  const refresh = () => client.invalidateQueries(trpc.bot.status.pathFilter());
  const activate = useMutation(trpc.bot.activate.mutationOptions({ onSettled: refresh }));
  const pause = useMutation(trpc.bot.setPaused.mutationOptions({ onSettled: refresh }));
  return {
    status,
    activate: () => activate.mutate(),
    togglePause: () => {
      if (status.data) pause.mutate({ paused: !status.data.paused });
    },
    pending: activate.isPending || pause.isPending,
    error:
      activate.error || pause.error
        ? "Não foi possível alterar o Bot. Confira as etapas e tente novamente."
        : null,
  };
};
