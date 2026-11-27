"use client";

import { useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { useRefreshBillingStatus } from "@/modules/billing/hooks";
import { formatDate } from "@/platform/format";
import { useConfirm } from "@/providers/confirm-provider";
import { idleFormState, type FormState } from "@/server/actions/form-state";
import { cancelSubscriptionAction } from "@/server/actions/billing";

// "Cancelar assinatura", after a confirmation. The Bot keeps replying until
// the end of the month already paid for.
export function CancelSubscription({ botActiveUntil }: { botActiveUntil: Date | null }) {
  const { confirm } = useConfirm();
  const [state, setState] = useState<FormState>(idleFormState);
  const refreshBillingStatus = useRefreshBillingStatus();

  return (
    <section aria-labelledby="cancel-subscription" className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h2 id="cancel-subscription" className="text-sm font-semibold">
          Cancelar assinatura
        </h2>
        <p className="text-xs text-muted-foreground">
          O Mercado Pago deixa de cobrar o cartão. Não há reembolso de parte do mês.
        </p>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            confirm({
              title: "Cancelar a assinatura?",
              message: botActiveUntil
                ? `O cartão não será mais cobrado. O Bot continua respondendo até ${formatDate(botActiveUntil)} e depois para. Até lá, você pode assinar de novo sem pagar duas vezes.`
                : "O cartão não será mais cobrado e o Bot para de responder.",
              action: async () => {
                setState(await cancelSubscriptionAction());
                void refreshBillingStatus();
              },
            })
          }
        >
          Cancelar assinatura
        </Button>
      </div>
      <FormMessage state={state} />
    </section>
  );
}
