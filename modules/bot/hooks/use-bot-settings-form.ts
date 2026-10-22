"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

type SettingsFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

type SaveSettings = (previous: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

// Submits the whole settings form. Passing the action to the form's `action`
// prop would reset every field after submitting, losing the owner's edits
// when the server refuses them; the fields stay as typed instead.
export const useBotSettingsForm = (save: SaveSettings) => {
  const client = useQueryClient();
  const trpc = useTRPC();
  const [state, formAction, pending] = useActionState(
    async (previous: SettingsFormState, data: FormData) => {
      const result = await save(previous, data);
      if (result.status === "success") await client.invalidateQueries(trpc.bot.status.pathFilter());
      return result;
    },
    { status: "idle" },
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  return { state, submit, pending };
};
