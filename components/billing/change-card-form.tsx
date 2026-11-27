"use client";

import { useState } from "react";
import { CardPaymentBrickFrame } from "@/components/billing/card-payment-brick-frame";
import { FormMessage } from "@/components/forms/form-message";
import { useCardPaymentBrick } from "@/modules/billing/hooks";
import { idleFormState, type FormState } from "@/server/actions/form-state";
import { changeCardAction } from "@/server/actions/billing";

// Mercado Pago's Card Payment Brick for the new card. The Brick sends only a
// card token to `changeCardAction`; on success `onChanged` gets its message
// and the page refreshes.
export function ChangeCardForm({
  publicKey,
  amountCents,
  payerEmail,
  onChanged,
}: {
  publicKey: string;
  amountCents: number;
  payerEmail: string;
  onChanged: (state: FormState) => void;
}) {
  const [state, setState] = useState<FormState>(idleFormState);
  const { containerId, status } = useCardPaymentBrick({
    publicKey,
    amountCents,
    payerEmail,
    async onSubmit(card) {
      const result = await changeCardAction(card);
      if (result.status === "error") {
        setState(result);
        throw new Error("card change refused");
      }
      onChanged(result);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <CardPaymentBrickFrame containerId={containerId} status={status} />
      <FormMessage state={state} />
    </div>
  );
}
