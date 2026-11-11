"use client";

import { useQuery } from "@tanstack/react-query";
import { placeholderConversationStats } from "@/modules/conversations/hooks/stats-placeholder";
import type { StatsPeriod } from "@/modules/conversations/stats";

// The home page's stats for one period. Until the stats read lands (#195) it
// answers with placeholder numbers; that change swaps this query's options for
// the tRPC procedure's, and its callers keep working unchanged.
export const useConversationStats = (period: StatsPeriod) =>
  useQuery({
    queryKey: ["conversation-stats-placeholder", period],
    queryFn: () => placeholderConversationStats(period, new Date()),
    staleTime: Infinity,
  });
