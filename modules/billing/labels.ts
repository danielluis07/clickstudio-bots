// Mercado Pago's Subscription statuses, as owners read them.
const billingSubscriptionStatusLabels: Record<string, string> = {
  authorized: "Ativa",
  pending: "Pendente",
  paused: "Pausada",
  cancelled: "Cancelada",
};

export const billingSubscriptionStatusLabel = (status: string) =>
  billingSubscriptionStatusLabels[status] ?? "Em análise";

// Until when the Bot replies if the Subscription is (or was) cancelled: the
// end of the month already paid for, or of a running Grace period. Null once
// the Tenant is Suspended, or with no Subscription.
export const billingBotActiveUntil = ({
  suspended,
  subscription,
}: {
  suspended: boolean;
  subscription: {
    active: boolean;
    nextChargeAt: Date | null;
    graceEndsAt: Date | null;
    paidUntil: Date | null;
  } | null;
}) => {
  if (suspended || !subscription) return null;
  return (
    subscription.paidUntil ??
    subscription.graceEndsAt ??
    (subscription.active ? subscription.nextChargeAt : null)
  );
};

// Mercado Pago's card brands (`payment_method_id`), as owners know them.
const billingCardBrandLabels: Record<string, string> = {
  visa: "Visa",
  master: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  diners: "Diners",
};

// The card that pays a Subscription, masked: "Visa •••• 3311", or whatever
// part of it is known.
export const billingCardLabel = (
  card: { brand: string | null; lastFour: string | null } | null,
) => {
  const brand = card?.brand ? (billingCardBrandLabels[card.brand] ?? card.brand) : null;
  const digits = card?.lastFour ? `•••• ${card.lastFour}` : null;
  return [brand, digits].filter(Boolean).join(" ") || "Cartão cadastrado no Mercado Pago";
};
