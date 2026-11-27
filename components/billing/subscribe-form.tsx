"use client";

import { useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { FormRow } from "@/components/forms/form-row";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardPaymentBrick } from "@/modules/billing/hooks";
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
  const { containerId, status } = useCardPaymentBrick({
    publicKey,
    amountCents,
    payerEmail: defaultEmail,
    async onSubmit(cardToken) {
      const result = await subscribeAction({ cardToken, payerEmail: email });
      setState(result);
      if (result.status === "error") throw new Error("subscribe refused");
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
      {status === "loading" && <Skeleton className="h-72 w-full" />}
      {status === "failed" && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar o formulário do cartão. Recarregue a página para tentar de
            novo.
          </AlertDescription>
        </Alert>
      )}
      <div id={containerId} />
      <FormMessage state={state} />
      <p className="text-xs text-muted-foreground">
        Os dados do cartão vão direto para o Mercado Pago. O ClickStudio Bots não os recebe nem os
        guarda.
      </p>
    </div>
  );
}
