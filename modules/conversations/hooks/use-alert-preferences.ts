"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

// The Member's own Alert preferences. Each switch saves on its own, shown at
// once and put back if the save fails.
export const useAlertPreferences = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.alerts.preferences.queryKey();
  const query = useQuery(trpc.alerts.preferences.queryOptions());
  const update = useMutation(
    trpc.alerts.updatePreferences.mutationOptions({
      onMutate: async (changes) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey);
        queryClient.setQueryData(queryKey, (current) => current && { ...current, ...changes });
        return { previous };
      },
      onError: (_error, _changes, context) => {
        if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      },
      onSuccess: (saved) => queryClient.setQueryData(queryKey, saved),
    }),
  );
  return { query, update };
};
