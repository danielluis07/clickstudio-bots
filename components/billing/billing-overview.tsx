import { BillingGuidance } from "@/components/billing/billing-guidance";
import { CancelSubscription } from "@/components/billing/cancel-subscription";
import { BillingSummary } from "@/components/billing/billing-summary";
import { SubscribeForm } from "@/components/billing/subscribe-form";
import { SubscriptionCardSection } from "@/components/billing/subscription-card-section";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { billingBotActiveUntil, type BillingCheckout } from "@/modules/billing";

// The owner's billing page. The card form shows until the Tenant has a
// Subscription that isn't cancelled; from then on, its card and "Alterar
// cartão".
export function BillingOverview({
  checkout,
  publicKey,
  defaultEmail,
}: {
  checkout: BillingCheckout;
  // Mercado Pago's public key, or null where it isn't configured.
  publicKey: string | null;
  defaultEmail: string;
}) {
  return (
    <DashboardPage title="Assinatura" width="form">
      <div className="flex flex-col gap-6">
        <BillingSummary checkout={checkout} />
        <BillingGuidance checkout={checkout} />
        {checkout.canSubscribe &&
          (checkout.available && publicKey ? (
            <SubscribeForm
              publicKey={publicKey}
              amountCents={checkout.planAmountCents}
              defaultEmail={defaultEmail}
            />
          ) : (
            <Alert>
              <AlertDescription>
                A cobrança ainda não está configurada neste ambiente.
              </AlertDescription>
            </Alert>
          ))}
        {checkout.canChangeCard && checkout.subscription && (
          <SubscriptionCardSection
            subscription={checkout.subscription}
            publicKey={checkout.available ? publicKey : null}
          />
        )}
        {checkout.canCancel && checkout.available && checkout.subscription && (
          <CancelSubscription botActiveUntil={billingBotActiveUntil(checkout)} />
        )}
      </div>
    </DashboardPage>
  );
}
