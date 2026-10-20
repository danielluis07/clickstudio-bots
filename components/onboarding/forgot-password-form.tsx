"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { idleFormState } from "@/server/actions/form-state";
import { requestPasswordResetAction } from "@/server/actions/password";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, idleFormState);

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Enviar link</SubmitButton>
      </FieldGroup>
    </form>
  );
}
