"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { StatsPeriod } from "@/modules/conversations/stats";
import { useTRPC } from "@/trpc/client";

// The home page's stats for one period. The previous period's numbers stay
// on screen while another loads.
export const useConversationStats = (period: StatsPeriod) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.conversations.stats.queryOptions({ period }, { placeholderData: keepPreviousData }),
  );
};
