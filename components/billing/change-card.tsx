"use client";

import { useState } from "react";
import { ChangeCardForm } from "@/components/billing/change-card-form";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { idleFormState, type FormState } from "@/server/actions/form-state";

// The card that pays the Subscription, masked, and "Alterar cartão", which
// opens the Card Payment Brick for a new one.
export function ChangeCard({
  cardLabel,
  publicKey,
  amountCents,
  payerEmail,
}: {
  cardLabel: string;
  publicKey: string;
  amountCents: number;
  payerEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(idleFormState);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{cardLabel}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setState(idleFormState);
          }}
        >
          {open ? "Cancelar" : "Alterar cartão"}
        </Button>
      </div>
      {open && (
        <ChangeCardForm
          publicKey={publicKey}
          amountCents={amountCents}
          payerEmail={payerEmail}
          onChanged={(changed) => {
            setOpen(false);
            setState(changed);
          }}
        />
      )}
      <FormMessage state={state} />
    </div>
  );
}
