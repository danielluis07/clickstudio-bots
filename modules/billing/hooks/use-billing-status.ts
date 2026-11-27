"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

// Whether the Member's Tenant is Suspended or its Trial is ending, for the
// dashboard's banner.
export const useBillingStatus = () => {
  const trpc = useTRPC();
  return useQuery(trpc.billing.status.queryOptions());
};

// Refetches the banner's billing status, for after the owner subscribes or
// cancels: the banner stays mounted across the dashboard's pages.
export const useRefreshBillingStatus = () => {
  const trpc = useTRPC();
  const client = useQueryClient();
  return () => client.invalidateQueries(trpc.billing.status.pathFilter());
};
