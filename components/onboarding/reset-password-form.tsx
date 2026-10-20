"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { NewPasswordFields } from "@/components/onboarding/new-password-fields";
import { FieldGroup } from "@/components/ui/field";
import { idleFormState } from "@/server/actions/form-state";
import { resetPasswordAction } from "@/server/actions/password";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, idleFormState);
  // From the emailed link; Better Auth validates it when the form is sent.
  const token = useSearchParams().get("token") ?? "";

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <FieldGroup>
        <NewPasswordFields label="Nova senha" />
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Salvar nova senha</SubmitButton>
      </FieldGroup>
    </form>
  );
}
