"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { handoffMutationOptions } from "@/modules/conversations/hooks/handoff-cache";
import { useTRPC } from "@/trpc/client";

// Selection is limited to visible Handoffs. A refreshed Conversation that is
// already with the Bot, or no longer in the list, cannot remain selected.
export const useBulkReturnToBot = (conversations: { id: string; owner: "bot" | "team" }[]) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const eligible = new Set(
    conversations.filter(({ owner }) => owner === "team").map(({ id }) => id),
  );
  const selectedIds = [...selection].filter((id) => eligible.has(id));
  const mutation = useMutation(
    trpc.handoff.bulkReturnToBot.mutationOptions({
      ...handoffMutationOptions(trpc, queryClient, "returnToBot"),
      onSuccess: () => setSelection(new Set()),
    }),
  );
  const selected = new Set(mutation.isPending ? mutation.variables.conversationIds : selectedIds);

  const toggle = (conversationId: string, checked: boolean) => {
    if (mutation.isPending || !eligible.has(conversationId)) return;
    mutation.reset();
    setSelection((previous) => {
      const next = new Set([...previous].filter((id) => eligible.has(id)));
      if (checked && next.size < 100) next.add(conversationId);
      if (!checked) next.delete(conversationId);
      return next;
    });
  };

  return {
    selected,
    toggle,
    hasHandoffs: eligible.size > 0,
    atLimit: selected.size >= 100,
    pending: mutation.isPending,
    failed: mutation.isError,
    succeeded: mutation.isSuccess,
    returnToBot: () => {
      if (selectedIds.length > 0 && !mutation.isPending)
        mutation.mutate({ conversationIds: selectedIds });
    },
  };
};
