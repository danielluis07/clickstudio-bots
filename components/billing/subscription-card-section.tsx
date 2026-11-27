import { ChangeCard } from "@/components/billing/change-card";
import { billingCardLabel, type BillingCheckout } from "@/modules/billing";

// The card that pays the Subscription. "Alterar cartão" shows only where
// Mercado Pago is configured.
export function SubscriptionCardSection({
  subscription,
  publicKey,
}: {
  subscription: NonNullable<BillingCheckout["subscription"]>;
  // Mercado Pago's public key, or null where it isn't configured.
  publicKey: string | null;
}) {
  const cardLabel = billingCardLabel(subscription.card);

  return (
    <section aria-labelledby="subscription-card" className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h2 id="subscription-card" className="text-sm font-semibold">
          Cartão
        </h2>
        <p className="text-xs text-muted-foreground">
          O Mercado Pago cobra este cartão. Ao trocá-lo, o valor e a data da cobrança continuam os
          mesmos.
        </p>
      </div>
      {publicKey ? (
        <ChangeCard
          cardLabel={cardLabel}
          publicKey={publicKey}
          amountCents={subscription.amountCents}
          payerEmail={subscription.payerEmail}
        />
      ) : (
        <p className="text-sm font-medium">{cardLabel}</p>
      )}
    </section>
  );
}
