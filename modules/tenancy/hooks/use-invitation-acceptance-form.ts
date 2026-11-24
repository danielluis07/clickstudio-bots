"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { passwordConfirmationError } from "@/modules/tenancy/password-confirmation";

type InvitationFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

type AcceptInvitation = (
  previous: InvitationFormState,
  formData: FormData,
) => Promise<InvitationFormState>;

// Checks that both passwords match before calling the server, and submits
// without the form's `action` prop: that prop resets every field after a
// refusal, clearing the Terms checkbox the owner had already ticked.
export const useInvitationAcceptanceForm = (accept: AcceptInvitation) => {
  const [serverState, formAction, pending] = useActionState(accept, { status: "idle" });
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const error = passwordConfirmationError(formData);
    setClientError(error);
    if (error) return;
    startTransition(() => formAction(formData));
  };

  const state: InvitationFormState = clientError
    ? { status: "error", message: clientError }
    : serverState;

  return { state, submit, pending };
};
