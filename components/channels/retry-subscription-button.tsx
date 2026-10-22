"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { retryWhatsAppSubscriptionAction } from "@/server/actions/channels";
import type { FormState } from "@/server/actions/form-state";

const initialState: FormState = { status: "idle" };

export function RetrySubscriptionButton() {
  const [state, action, pending] = useActionState(retryWhatsAppSubscriptionAction, initialState);
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <SubmitButton pending={pending}>
        {pending ? "Verificando…" : "Tentar receber eventos novamente"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
