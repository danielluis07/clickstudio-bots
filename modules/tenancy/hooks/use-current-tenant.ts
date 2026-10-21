"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export const useCurrentTenant = () => {
  const trpc = useTRPC();
  return useQuery(trpc.tenancy.current.queryOptions());
};
