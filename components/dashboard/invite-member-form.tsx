"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { idleFormState } from "@/server/actions/form-state";
import { inviteMemberAction } from "@/server/actions/members";

export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(inviteMemberAction, idleFormState);

  return (
    <form action={formAction} className="max-w-md">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">E-mail da pessoa</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="off" required />
        </Field>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Enviar convite</SubmitButton>
      </FieldGroup>
    </form>
  );
}
