"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { invalidateInbox, startInboxRealtime } from "@/modules/conversations/hooks/realtime";
import { useTRPC } from "@/trpc/client";

export const useInboxRealtime = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: issueToken } = useMutation(trpc.realtime.token.mutationOptions());

  useEffect(
    () =>
      startInboxRealtime({
        issueToken,
        invalidate: (ping) => {
          void invalidateInbox(queryClient, trpc, ping);
        },
      }),
    [issueToken, queryClient, trpc],
  );
};
