"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { contactDetailInputs } from "@/modules/conversations/hooks/contact-display";
import {
  patchConversationCaches,
  rollback,
} from "@/modules/conversations/hooks/conversation-cache";
import { useTRPC } from "@/trpc/client";

type Details = { name: string; email: string; city: string; need: string };
type ContactWithDetails = {
  id: string;
  name: string | null;
  appName: string | null;
  profileName: string | null;
  email: string | null;
  city: string | null;
  need: string | null;
};

const blankAsNull = (value: string) => value.trim() || null;

// Shows the Contact's new details at once, in the open Conversation and its
// name in the list, and restores the previous ones if the server refuses.
export const useUpdateContactDetails = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.contacts.update.mutationOptions({
      onMutate: ({ contactId, name, email, city, need }) =>
        patchConversationCaches(queryClient, trpc, {
          filters: [trpc.conversations.get.pathFilter()],
          patch: (found) =>
            found.contact.id === contactId
              ? {
                  ...found,
                  contact: {
                    ...found.contact,
                    name: blankAsNull(name),
                    email: blankAsNull(email),
                    city: blankAsNull(city),
                    need: blankAsNull(need),
                  },
                }
              : found,
          patchRow: (row) =>
            row.contact.id === contactId
              ? { ...row, contact: { ...row.contact, name: blankAsNull(name) } }
              : row,
        }),
      onError: (_error, _input, context) => rollback(queryClient, context?.previous),
      onSettled: () =>
        Promise.all(
          [trpc.conversations.get.pathFilter(), trpc.conversations.list.pathFilter()].map(
            (filter) => queryClient.invalidateQueries(filter),
          ),
        ),
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
    inputs: contactDetailInputs(contact).map((input) => ({
      ...input,
      value: details[input.field],
    })),
    change,
    submit,
    saving: update.isPending,
    // A malformed email is the one refusal the Member can correct here.
    invalid: update.error?.data?.code === "BAD_REQUEST",
    failed: update.isError,
    saved: update.isSuccess,
  };
};
