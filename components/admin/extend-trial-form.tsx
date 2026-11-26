"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { idleFormState, type FormState } from "@/server/actions/form-state";

type ExtendTrialAction = (previous: FormState, formData: FormData) => Promise<FormState>;

export function ExtendTrialForm({
  tenantId,
  tenantName,
  action,
}: {
  tenantId: string;
  tenantName: string;
  action: ExtendTrialAction;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  const inputId = `trialEndsOn-${tenantId}`;

  return (
    <form action={formAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field>
        <FieldLabel htmlFor={inputId} className="sr-only">
          Último dia do teste de {tenantName}
        </FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Input id={inputId} name="trialEndsOn" type="date" required className="w-auto" />
          <SubmitButton pending={pending}>Estender</SubmitButton>
        </div>
        <FormMessage state={state} />
      </Field>
    </form>
  );
}
