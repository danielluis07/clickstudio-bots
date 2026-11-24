"use client";

import type { ReactNode } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { FieldGroup } from "@/components/ui/field";
import { useInvitationAcceptanceForm } from "@/modules/tenancy/hooks";
import { acceptInvitationAction } from "@/server/actions/invitation";

type InvitationAcceptanceFormProps = {
  invitationId: string;
  // Server-rendered fields; this component only owns the submission state.
  children: ReactNode;
};

export function InvitationAcceptanceForm({
  invitationId,
  children,
}: InvitationAcceptanceFormProps) {
  const form = useInvitationAcceptanceForm(acceptInvitationAction.bind(null, invitationId));

  return (
    <form onSubmit={form.submit}>
      <FieldGroup>
        {children}
        <FormMessage state={form.state} />
        <SubmitButton pending={form.pending}>Aceitar convite</SubmitButton>
      </FieldGroup>
    </form>
  );
}
