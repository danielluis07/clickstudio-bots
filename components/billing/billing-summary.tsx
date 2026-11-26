import { StatTile } from "@/components/overview/stat-tile";
import { subscriptionStatusLabel, type BillingCheckout } from "@/modules/billing";
import { monthlyReplyLimit } from "@/modules/bot";
import { formatCount, formatDate, formatLastDay, formatReais } from "@/platform/format";

// The Plan, where the Tenant stands, and what happens next, in one ribbon.
export function BillingSummary({ checkout }: { checkout: BillingCheckout }) {
  const { subscription, suspended, trialEndsAt } = checkout;

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
      <StatTile
        label="Plano mensal"
        value={formatReais(checkout.planAmountCents)}
        caption={`${formatCount(monthlyReplyLimit)} respostas do Bot por mês`}
        highlight
      />
      {subscription ? (
        <StatTile
          label="Assinatura"
          value={subscriptionStatusLabel(subscription.status)}
          caption={`Recibos para ${subscription.payerEmail}`}
        />
      ) : (
        <StatTile
          label="Situação"
          value={suspended ? "Suspenso" : trialEndsAt ? "Período de teste" : "Sem assinatura"}
          caption={suspended ? "O Bot parou de responder" : undefined}
        />
      )}
      {subscription?.active && subscription.nextChargeAt ? (
        <StatTile label="Próxima cobrança" value={formatDate(subscription.nextChargeAt)} />
      ) : (
        <StatTile
          label="Teste até"
          value={trialEndsAt && !suspended ? formatLastDay(trialEndsAt) : "—"}
        />
      )}
    </dl>
  );
}
