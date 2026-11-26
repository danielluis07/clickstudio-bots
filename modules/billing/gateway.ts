// The payment provider behind Subscriptions (ADR 0012): Mercado Pago's
// `preapproval` in production (`platform/mercado-pago.ts`), a fake in tests.
// Amounts are in centavos.

// A Subscription as the provider holds it. `status` is the provider's own:
// `authorized` (active), `pending`, `paused` or `cancelled`.
export type ProviderSubscription = {
  id: string;
  status: string;
  // Null when the provider answers without one; the stored email is kept.
  payerEmail: string | null;
  amountCents: number;
  nextChargeAt: Date | null;
  // When the provider last changed it, so an older read never overwrites a
  // newer one.
  modifiedAt: Date;
};

export type ProviderPayment = {
  id: string;
  // The provider's own: `approved`, `rejected`, `refunded`, …
  status: string;
  amountCents: number;
  approvedAt: Date | null;
  // The Subscription the payment charged, or null for any other payment.
  subscriptionId: string | null;
};

export type NewProviderSubscription = {
  // From the Card Payment Brick: card data never reaches our servers.
  cardToken: string;
  payerEmail: string;
  amountCents: number;
  // The first charge; null charges now.
  startDate: Date | null;
  reason: string;
  // The Tenant's id, to find the Subscription in the provider's panel.
  externalReference: string;
  backUrl: string;
};

export type SubscriptionGateway = {
  // Monthly, in BRL. A refused card or request is `rejected`; an unreachable
  // provider throws.
  createSubscription(
    subscription: NewProviderSubscription,
  ): Promise<{ ok: true; subscription: ProviderSubscription } | { ok: false; error: "rejected" }>;
  fetchSubscription(id: string): Promise<ProviderSubscription>;
  updateSubscription(
    id: string,
    change: { status?: "cancelled"; cardToken?: string },
  ): Promise<ProviderSubscription>;
  fetchPayment(id: string): Promise<ProviderPayment>;
  // One monthly charge of a Subscription, and the payment that settled it.
  fetchAuthorizedPayment(id: string): Promise<{ subscriptionId: string; paymentId: string | null }>;
};
