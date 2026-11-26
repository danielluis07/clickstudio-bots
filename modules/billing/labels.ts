// Mercado Pago's Subscription statuses, as owners read them.
const subscriptionStatusLabels: Record<string, string> = {
  authorized: "Ativa",
  pending: "Pendente",
  paused: "Pausada",
  cancelled: "Cancelada",
};

export const subscriptionStatusLabel = (status: string) =>
  subscriptionStatusLabels[status] ?? "Em análise";
