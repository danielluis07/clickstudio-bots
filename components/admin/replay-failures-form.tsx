"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field } from "@/components/ui/field";
import { idleFormState, type FormState } from "@/server/actions/form-state";

type ReplayFailuresAction = (previous: FormState, formData: FormData) => Promise<FormState>;

// Replays the given events, or every listed failure when `eventIds` is absent.
export function ReplayFailuresForm({
  eventIds,
  label,
  action,
}: {
  eventIds?: string[];
  label: string;
  action: ReplayFailuresAction;
}) {
  const [state, formAction, pending] = useActionState(action, idleFormState);

  return (
    <form action={formAction}>
      <input type="hidden" name="scope" value={eventIds ? "page" : "all"} />
      {eventIds?.map((id) => (
        <input key={id} type="hidden" name="inboxEventId" value={id} />
      ))}
      <Field>
        <SubmitButton pending={pending}>{label}</SubmitButton>
        <FormMessage state={state} />
      </Field>
    </form>
  );
}
