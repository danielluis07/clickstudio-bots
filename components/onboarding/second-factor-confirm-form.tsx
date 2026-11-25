"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { idleFormState } from "@/server/actions/form-state";
import { confirmSecondFactorSetupAction } from "@/server/actions/second-factor";

// Step 2 of the setup: the app's first code turns the second factor on.
export function SecondFactorConfirmForm() {
  const [state, formAction, pending] = useActionState(
    confirmSecondFactorSetupAction,
    idleFormState,
  );

  return (
    <form action={formAction}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="code">3. Digite o código de 6 dígitos do aplicativo</FieldLabel>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            required
          />
        </Field>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Ativar e continuar</SubmitButton>
      </FieldGroup>
    </form>
  );
}
