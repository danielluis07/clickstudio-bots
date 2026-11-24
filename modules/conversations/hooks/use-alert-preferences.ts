"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import type { AlertPreferences } from "@/modules/conversations/alert-preferences";
import {
  notificationsGranted,
  requestNotificationPermission,
  subscribeNotificationPermission,
} from "@/modules/conversations/hooks/browser-alert-signals";
import { useTRPC } from "@/trpc/client";

// The Member's own Alert preferences. Each switch saves on its own, shown at
// once and put back if the save fails.
export const useAlertPreferences = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.alerts.preferences.queryKey();
  const query = useQuery(trpc.alerts.preferences.queryOptions());
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const granted = useSyncExternalStore(
    subscribeNotificationPermission,
    notificationsGranted,
    () => false,
  );
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

  // Browser notifications show as on only where this browser allows them, so
  // in a new browser turning the switch on asks for its permission.
  const isOn = (key: keyof AlertPreferences) =>
    (query.data?.[key] ?? false) && (key !== "browserNotification" || granted);

  // Turning browser notifications on is the one moment the browser is asked
  // for permission. If it refuses, the switch stays off.
  const change = async (key: keyof AlertPreferences, checked: boolean) => {
    if (key === "browserNotification") {
      setNotificationsBlocked(false);
      if (checked && !(await requestNotificationPermission())) {
        setNotificationsBlocked(true);
        return;
      }
    }
    update.mutate({ [key]: checked });
  };

  return { query, update, isOn, change, notificationsBlocked };
};
