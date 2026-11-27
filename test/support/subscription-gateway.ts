import type {
  NewProviderSubscription,
  ProviderPayment,
  ProviderSubscription,
  SubscriptionGateway,
} from "@/modules/billing";
import type { Clock } from "@/platform/clock";

export type TestSubscriptionGateway = SubscriptionGateway & {
  created: NewProviderSubscription[];
  updates: { id: string; change: { status: "cancelled" } }[];
  cardChanges: { id: string; cardToken: string; resume: boolean }[];
  // Mercado Pago's own records, which tests change to simulate its side.
  subscriptions: Map<string, ProviderSubscription>;
  payments: Map<string, ProviderPayment>;
  // In the order Mercado Pago made them.
  authorizedPayments: Map<string, { subscriptionId: string; paymentId: string | null }>;
  rejectNext(): void;
  // Mercado Pago's monthly billing: charges every `authorized` Subscription
  // whose charge is due, approved, and moves its next charge a month ahead.
  // Returns the Subscriptions it charged. A cancelled one is never charged.
  runCharges(): string[];
};

// Mercado Pago in memory. A created Subscription is `authorized` at once, paid
// by a Visa, and its first charge is on its start date, or now without one. A
// changed card is a Mastercard.
export const createTestSubscriptionGateway = (clock: Clock): TestSubscriptionGateway => {
  const created: NewProviderSubscription[] = [];
  const updates: TestSubscriptionGateway["updates"] = [];
  const cardChanges: TestSubscriptionGateway["cardChanges"] = [];
  const subscriptions = new Map<string, ProviderSubscription>();
  const payments = new Map<string, ProviderPayment>();
  const authorizedPayments: TestSubscriptionGateway["authorizedPayments"] = new Map();
  let reject = false;
  const rejected = () => {
    const was = reject;
    reject = false;
    return was;
  };

  const found = <T>(records: Map<string, T>, id: string) => {
    const record = records.get(id);
    if (!record) throw new Error(`Mercado Pago has no ${id}`);
    return structuredClone(record);
  };

  return {
    created,
    updates,
    cardChanges,
    subscriptions,
    payments,
    authorizedPayments,
    rejectNext: () => {
      reject = true;
    },
    runCharges() {
      const now = clock.now();
      const charged: string[] = [];
      for (const record of subscriptions.values()) {
        if (record.status !== "authorized" || !record.nextChargeAt || record.nextChargeAt > now)
          continue;
        const paymentId = `payment-${payments.size + 1}`;
        payments.set(paymentId, {
          id: paymentId,
          status: "approved",
          amountCents: record.amountCents,
          createdAt: now,
          approvedAt: now,
          subscriptionId: record.id,
          externalReference: null,
          modifiedAt: now,
        });
        authorizedPayments.set(`invoice-${authorizedPayments.size + 1}`, {
          subscriptionId: record.id,
          paymentId,
        });
        const nextChargeAt = new Date(record.nextChargeAt);
        nextChargeAt.setUTCMonth(nextChargeAt.getUTCMonth() + 1);
        subscriptions.set(record.id, {
          ...record,
          nextChargeAt,
          lastCharge: { at: now, amountCents: record.amountCents },
          modifiedAt: now,
        });
        charged.push(record.id);
      }
      return charged;
    },
    async createSubscription(subscription) {
      created.push(subscription);
      if (rejected()) return { ok: false, error: "rejected" };
      const record = {
        id: `preapproval-${created.length}`,
        status: "authorized",
        payerEmail: subscription.payerEmail,
        amountCents: subscription.amountCents,
        nextChargeAt: subscription.startDate ?? clock.now(),
        lastCharge: null,
        modifiedAt: clock.now(),
        cardBrand: "visa",
      };
      subscriptions.set(record.id, record);
      return { ok: true, subscription: structuredClone(record) };
    },
    fetchSubscription: async (id) => found(subscriptions, id),
    async updateSubscription(id, change) {
      updates.push({ id, change });
      const record = found(subscriptions, id);
      const updated = {
        ...record,
        status: change.status,
        modifiedAt: clock.now(),
      };
      subscriptions.set(id, updated);
      return structuredClone(updated);
    },
    async changeCard(id, { cardToken, resume }) {
      if (rejected()) return { ok: false, error: "rejected" };
      cardChanges.push({ id, cardToken, resume });
      const record = found(subscriptions, id);
      const updated = {
        ...record,
        status: resume ? "authorized" : record.status,
        cardBrand: "master",
        modifiedAt: clock.now(),
      };
      subscriptions.set(id, updated);
      return { ok: true, subscription: structuredClone(updated) };
    },
    fetchPayment: async (id) => found(payments, id),
    fetchAuthorizedPayment: async (id) => found(authorizedPayments, id),
    // The one added last is the most recent.
    async fetchLatestAuthorizedPayment(subscriptionId) {
      const charges = [...authorizedPayments.values()].filter(
        (charge) => charge.subscriptionId === subscriptionId,
      );
      return charges.length ? structuredClone(charges[charges.length - 1]) : null;
    },
  };
};
