"use client";

import { useActionState, type ReactNode } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { FieldGroup } from "@/components/ui/field";
import { idleFormState } from "@/lib/actions/form-state";
import { acceptInvitationAction } from "@/lib/actions/invitation";

type InvitationAcceptanceFormProps = {
  invitationId: string;
  // Server-rendered fields; this component only owns the submission state.
  children: ReactNode;
};

export function InvitationAcceptanceForm({ invitationId, children }: InvitationAcceptanceFormProps) {
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction.bind(null, invitationId),
    idleFormState,
  );

  return (
    <form action={formAction}>
      <FieldGroup>
        {children}
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Aceitar convite</SubmitButton>
      </FieldGroup>
    </form>
  );
}
