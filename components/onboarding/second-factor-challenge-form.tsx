"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { idleFormState } from "@/server/actions/form-state";
import { verifySecondFactorAction } from "@/server/actions/second-factor";
import { returnToParam } from "@/server/auth/redirects";

export function SecondFactorChallengeForm({ returnTo }: { returnTo: string }) {
  const [state, formAction, pending] = useActionState(verifySecondFactorAction, idleFormState);

  return (
    <form action={formAction}>
      <input type="hidden" name={returnToParam} value={returnTo} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="code">Código</FieldLabel>
          <Input
            id="code"
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
          <FieldDescription>
            Sem o celular? Digite um dos códigos de recuperação que você guardou.
          </FieldDescription>
        </Field>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Verificar</SubmitButton>
      </FieldGroup>
    </form>
  );
}
