"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import {
  alertTabTitle,
  createBrowserAlertSignaller,
  getViewedConversation,
  setViewedConversation,
} from "@/modules/conversations/hooks/alert-signals";
import { startAlertsRealtime } from "@/modules/conversations/hooks/realtime";
import { useTRPC } from "@/trpc/client";

// The bell: the Member's newest Alerts and how many are unread in all.
export const useAlerts = () => {
  const trpc = useTRPC();
  return useQuery(trpc.alerts.list.queryOptions());
};

// Keeps the bell live on every dashboard page. Pings carry only an Alert id;
// the list comes back through the authenticated query. A new Alert then plays
// the sound and shows the browser notification the Member turned on, in one
// tab only (createAlertSignaller).
export const useAlertsRealtime = ({
  openConversation,
}: {
  openConversation: (conversationId: string) => void;
}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: issueToken } = useMutation(trpc.realtime.token.mutationOptions());
  const open = useRef(openConversation);
  useEffect(() => {
    open.current = openConversation;
  }, [openConversation]);

  useEffect(() => {
    const signaller = createBrowserAlertSignaller({
      openConversation: (conversationId) => open.current(conversationId),
    });
    const signal = async (alertId: string) => {
      const [list, preferences] = await Promise.all([
        queryClient
          .invalidateQueries(trpc.alerts.list.queryFilter())
          .then(() => queryClient.getQueryData(trpc.alerts.list.queryKey())),
        queryClient.ensureQueryData(trpc.alerts.preferences.queryOptions()),
      ]);
      const alert = list?.alerts.find((entry) => entry.id === alertId);
      if (!alert) return;
      const visible = document.visibilityState === "visible";
      await signaller.signal({
        alert,
        preferences,
        tab: { visible, viewing: visible && getViewedConversation() === alert.conversationId },
      });
    };
    return startAlertsRealtime({
      issueToken,
      refresh: (alertId) => {
        if (alertId) void signal(alertId).catch(() => {});
        else void queryClient.invalidateQueries(trpc.alerts.list.queryFilter());
      },
    });
  }, [issueToken, queryClient, trpc]);
};

// Puts the unread count in front of the tab title on every dashboard page,
// and again after each navigation sets a new title.
export const useAlertTabTitle = (unread: number) => {
  useEffect(() => {
    const apply = () => {
      const title = alertTabTitle(document.title, unread);
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = alertTabTitle(document.title, 0);
    };
  }, [unread]);
};

// "Limpar tudo": deletes the Member's own Alerts.
export const useClearAlerts = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.alerts.clear.mutationOptions({
      onSuccess: () => {
        queryClient.setQueryData(trpc.alerts.list.queryKey(), { unread: 0, alerts: [] });
      },
      onSettled: () => queryClient.invalidateQueries(trpc.alerts.list.queryFilter()),
    }),
  );
};

// The Conversation the Member has open. Opening it reads its Alerts, and
// Alerts raised while it stays open in a visible tab arrive read.
export const useReadConversationAlerts = (conversationId: string) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const visible = useDocumentVisible();
  const { data } = useAlerts();
  const { mutate } = useMutation(
    trpc.alerts.markConversationRead.mutationOptions({
      onSettled: () => queryClient.invalidateQueries(trpc.alerts.list.queryFilter()),
    }),
  );
  const hasUnread =
    data?.alerts.some((alert) => alert.conversationId === conversationId && !alert.read) ?? false;
  // Alerts past the bell's newest are read on opening too.
  const opened = useRef<string | null>(null);

  // Alerts raised for it while it is open in front play no sound and show no
  // notification in any tab.
  useEffect(() => {
    setViewedConversation(conversationId);
    return () => setViewedConversation(null);
  }, [conversationId]);

  useEffect(() => {
    if (!visible || (opened.current === conversationId && !hasUnread)) return;
    opened.current = conversationId;
    queryClient.setQueryData(trpc.alerts.list.queryKey(), (list) => {
      if (!list) return list;
      const reading = list.alerts.filter(
        (alert) => alert.conversationId === conversationId && !alert.read,
      ).length;
      return {
        unread: Math.max(0, list.unread - reading),
        alerts: list.alerts.map((alert) =>
          alert.conversationId === conversationId ? { ...alert, read: true } : alert,
        ),
      };
    });
    mutate({ conversationId });
  }, [conversationId, hasUnread, mutate, queryClient, trpc, visible]);
};
