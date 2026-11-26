"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

// What the Tour needs to start: whether the Member has seen it, and whether
// the Bot is live, which decides the owner's last step. `ready` once both are
// known.
export const useMemberTour = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const tour = useQuery(trpc.tenancy.tour.queryOptions());
  const bot = useQuery(trpc.bot.status.queryOptions());
  const markSeen = useMutation(
    trpc.tenancy.markTourSeen.mutationOptions({
      onSuccess: () => queryClient.setQueryData(trpc.tenancy.tour.queryKey(), { seen: true }),
    }),
  );

  return {
    ready: Boolean(tour.data && bot.data),
    seen: tour.data?.seen ?? false,
    botLive: bot.data?.enabled ?? false,
    markSeen: () => markSeen.mutate(),
  };
};
