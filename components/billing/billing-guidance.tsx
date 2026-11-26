import type { BillingCheckout } from "@/modules/billing";
import { formatDate } from "@/platform/format";

// What subscribing does now, or what the owner is waiting for.
export function BillingGuidance({ checkout }: { checkout: BillingCheckout }) {
  const { subscription, suspended, trialEndsAt } = checkout;
  let text: string;
  if (subscription?.active) {
    text = suspended
      ? "Assinatura feita. O Bot volta a responder assim que o Mercado Pago aprovar a cobrança, o que costuma levar alguns minutos."
      : "Sua assinatura está ativa. O Mercado Pago cobra o cartão todo mês e envia o recibo por e-mail.";
  } else if (subscription && subscription.status !== "cancelled") {
    text =
      "O Mercado Pago ainda não confirmou esta assinatura. Esta página mostra a situação assim que ele avisar.";
  } else if (suspended) {
    text =
      "O período de teste terminou e o Bot parou de responder. Ao assinar, o cartão é cobrado na hora e o Bot volta assim que o Mercado Pago aprovar a cobrança.";
  } else if (trialEndsAt) {
    text = `Assine agora e continue usando sem interrupção: a primeira cobrança só acontece em ${formatDate(trialEndsAt)}, quando o teste termina.`;
  } else {
    text = "A cobrança está desligada neste ambiente. Uma assinatura feita aqui é cobrada na hora.";
  }

  return <p className="text-sm text-muted-foreground">{text}</p>;
}
