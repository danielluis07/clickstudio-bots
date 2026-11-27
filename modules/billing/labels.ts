// Mercado Pago's Subscription statuses, as owners read them.
const billingSubscriptionStatusLabels: Record<string, string> = {
  authorized: "Ativa",
  pending: "Pendente",
  paused: "Pausada",
  cancelled: "Cancelada",
};

export const billingSubscriptionStatusLabel = (status: string) =>
  billingSubscriptionStatusLabels[status] ?? "Em análise";
