"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

// Whether the Member's Tenant is Suspended, for the dashboard's banner.
export const useBillingStatus = () => {
  const trpc = useTRPC();
  return useQuery(trpc.billing.status.queryOptions());
};
