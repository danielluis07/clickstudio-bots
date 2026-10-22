"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createTenantAction } from "@/server/actions/admin";
import { idleFormState } from "@/server/actions/form-state";

export function CreateTenantForm() {
  const [state, formAction, pending] = useActionState(createTenantAction, idleFormState);

  return (
    <form action={formAction} className="max-w-md">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="tenantName">Nome do negócio</FieldLabel>
          <Input id="tenantName" name="tenantName" required maxLength={120} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ownerEmail">E-mail do responsável</FieldLabel>
          <Input id="ownerEmail" name="ownerEmail" type="email" required />
          <FieldDescription>
            O responsável recebe o convite por e-mail e aceita os Termos e o DPA ao entrar.
          </FieldDescription>
        </Field>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Criar negócio e enviar convite</SubmitButton>
      </FieldGroup>
    </form>
  );
}
