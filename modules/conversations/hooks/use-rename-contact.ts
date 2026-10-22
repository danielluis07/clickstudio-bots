"use client";

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { useState, type FormEvent } from "react";
import { useTRPC } from "@/trpc/client";

type Trpc = ReturnType<typeof useTRPC>;
type ConversationList = InfiniteData<inferOutput<Trpc["conversations"]["list"]>>;
type Conversation = inferOutput<Trpc["conversations"]["get"]>;

// Renames the Contact on screen at once, in the open Conversation and the
// list, and restores the previous name if the server refuses.
export const useRenameContact = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const affected = [trpc.conversations.get.pathFilter(), trpc.conversations.list.pathFilter()];

  return useMutation(
    trpc.contacts.rename.mutationOptions({
      onMutate: async ({ contactId, name }) => {
        await Promise.all(affected.map((filter) => queryClient.cancelQueries(filter)));
        const previous = affected.flatMap((filter) => queryClient.getQueriesData(filter));
        const rename = <T extends { contact: { id: string; name: string | null } }>(found: T): T =>
          found.contact.id === contactId
            ? { ...found, contact: { ...found.contact, name: name.trim() || null } }
            : found;

        queryClient.setQueriesData<Conversation>(
          trpc.conversations.get.pathFilter(),
          (found) => found && rename(found),
        );
        queryClient.setQueriesData<ConversationList>(
          trpc.conversations.list.pathFilter(),
          (list) =>
            list && {
              ...list,
              pages: list.pages.map((page) => ({
                ...page,
                conversations: page.conversations.map(rename),
              })),
            },
        );
        return { previous };
      },
      onError: (_error, _input, context) => {
        context?.previous.forEach(([queryKey, data]: [QueryKey, unknown]) =>
          queryClient.setQueryData(queryKey, data),
        );
      },
      onSettled: () => Promise.all(affected.map((filter) => queryClient.invalidateQueries(filter))),
    }),
  );
};

export const useContactNameForm = (contact: { id: string; name: string | null }) => {
  const rename = useRenameContact();
  const [name, setName] = useState(contact.name ?? "");

  // Editing again clears the last save's outcome.
  const changeName = (value: string) => {
    setName(value);
    rename.reset();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    rename.mutate({ contactId: contact.id, name });
  };

  return {
    name,
    changeName,
    submit,
    saving: rename.isPending,
    failed: rename.isError,
    saved: rename.isSuccess,
  };
};
