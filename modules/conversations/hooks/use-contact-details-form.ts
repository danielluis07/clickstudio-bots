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
type Details = { name: string; email: string; city: string; need: string };
type ContactWithDetails = {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  need: string | null;
};

const shown = (value: string) => value.trim() || null;

// Shows the Contact's new details at once, in the open Conversation and its
// name in the list, and restores the previous ones if the server refuses.
export const useUpdateContactDetails = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const affected = [trpc.conversations.get.pathFilter(), trpc.conversations.list.pathFilter()];

  return useMutation(
    trpc.contacts.update.mutationOptions({
      onMutate: async ({ contactId, name, email, city, need }) => {
        await Promise.all(affected.map((filter) => queryClient.cancelQueries(filter)));
        const previous = affected.flatMap((filter) => queryClient.getQueriesData(filter));
        const rename = <T extends { contact: { id: string; name: string | null } }>(found: T): T =>
          found.contact.id === contactId
            ? { ...found, contact: { ...found.contact, name: shown(name) } }
            : found;

        queryClient.setQueriesData<Conversation>(trpc.conversations.get.pathFilter(), (found) =>
          found && found.contact.id === contactId
            ? {
                ...found,
                contact: {
                  ...found.contact,
                  name: shown(name),
                  email: shown(email),
                  city: shown(city),
                  need: shown(need),
                },
              }
            : found,
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

// Shows the Contact's details as saved, including ones the Bot captures while
// the panel is open, until the Member edits them; a save hands them back.
export const useContactDetailsForm = (contact: ContactWithDetails) => {
  const update = useUpdateContactDetails();
  const [edits, setEdits] = useState<Details | null>(null);
  const details = edits ?? {
    name: contact.name ?? "",
    email: contact.email ?? "",
    city: contact.city ?? "",
    need: contact.need ?? "",
  };

  // Editing again clears the last save's outcome.
  const change = (field: keyof Details, value: string) => {
    setEdits({ ...details, [field]: value });
    update.reset();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({ contactId: contact.id, ...details }, { onSuccess: () => setEdits(null) });
  };

  return {
    details,
    change,
    submit,
    saving: update.isPending,
    // A malformed email is the one refusal the Member can correct here.
    invalid: update.error?.data?.code === "BAD_REQUEST",
    failed: update.isError,
    saved: update.isSuccess,
  };
};
