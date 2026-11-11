"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

// The Channel as the dashboard header and the Bot checklist show it.
export const useChannelStatus = () => {
  const trpc = useTRPC();
  return useQuery(trpc.channels.status.queryOptions());
};
