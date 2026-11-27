"use client";

import { useState } from "react";
import { CardPaymentBrickFrame } from "@/components/billing/card-payment-brick-frame";
import { FormMessage } from "@/components/forms/form-message";
import { FormRow } from "@/components/forms/form-row";
import { Input } from "@/components/ui/input";
import { useCardPaymentBrick, useRefreshBillingStatus } from "@/modules/billing/hooks";
import { idleFormState, type FormState } from "@/server/actions/form-state";
import { subscribeAction } from "@/server/actions/billing";

// The payer's email and Mercado Pago's Card Payment Brick. The Brick sends
// only a card token to `subscribeAction`; the page refreshes on success.
export function SubscribeForm({
  publicKey,
  amountCents,
  defaultEmail,
}: {
  publicKey: string;
  amountCents: number;
  defaultEmail: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState<FormState>(idleFormState);
  const refreshBillingStatus = useRefreshBillingStatus();
  const { containerId, status } = useCardPaymentBrick({
    publicKey,
    amountCents,
    payerEmail: defaultEmail,
    async onSubmit(card) {
      const result = await subscribeAction({ ...card, payerEmail: email });
      setState(result);
      if (result.status === "error") throw new Error("subscribe refused");
      void refreshBillingStatus();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <FormRow
        label="E-mail do pagador"
        htmlFor="payer-email"
        description="O Mercado Pago envia os recibos para este e-mail."
      >
        <Input
          id="payer-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="payer-email-description"
        />
      </FormRow>
      <CardPaymentBrickFrame containerId={containerId} status={status} />
      <FormMessage state={state} />
      <p className="text-xs text-muted-foreground">
        Os dados do cartão vão direto para o Mercado Pago. O ClickStudio Bots não os recebe nem os
        guarda.
      </p>
    </div>
  );
}
