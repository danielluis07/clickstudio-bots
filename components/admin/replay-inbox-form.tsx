"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldGroup } from "@/components/ui/field";
import { idleFormState, type FormState } from "@/server/actions/form-state";

type ReplayAction = (previous: FormState, formData: FormData) => Promise<FormState>;

export function ReplayInboxForm({ eventId, action }: { eventId: string; action: ReplayAction }) {
  const [state, formAction, pending] = useActionState(action, idleFormState);

  return (
    <form action={formAction}>
      <input type="hidden" name="inboxEventId" value={eventId} />
      <FieldGroup>
        <Field>
          <SubmitButton pending={pending}>Reprocessar</SubmitButton>
          <FormMessage state={state} />
        </Field>
      </FieldGroup>
    </form>
  );
}
