"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { idleFormState } from "@/lib/actions/form-state";
import { signInAction } from "@/lib/actions/session";
import { returnToParam } from "@/lib/auth-redirects";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, idleFormState);
  // Set by proxy.ts; the action only follows it to a path inside the app.
  const returnTo = useSearchParams().get(returnToParam) ?? "";

  return (
    <form action={formAction}>
      <input type="hidden" name={returnToParam} value={returnTo} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Entrar</SubmitButton>
      </FieldGroup>
    </form>
  );
}
