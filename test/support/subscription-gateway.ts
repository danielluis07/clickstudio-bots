import type {
  NewProviderSubscription,
  ProviderPayment,
  ProviderSubscription,
  SubscriptionGateway,
} from "@/modules/billing";
import type { Clock } from "@/platform/clock";

export type TestSubscriptionGateway = SubscriptionGateway & {
  created: NewProviderSubscription[];
  updates: { id: string; change: { status?: "cancelled"; cardToken?: string } }[];
  // Mercado Pago's own records, which tests change to simulate its side.
  subscriptions: Map<string, ProviderSubscription>;
  payments: Map<string, ProviderPayment>;
  // In the order Mercado Pago made them.
  authorizedPayments: Map<string, { subscriptionId: string; paymentId: string | null }>;
  rejectNext(): void;
};

// Mercado Pago in memory. A created Subscription is `authorized` at once, and
// its first charge is on its start date, or now without one.
export const createTestSubscriptionGateway = (clock: Clock): TestSubscriptionGateway => {
  const created: NewProviderSubscription[] = [];
  const updates: TestSubscriptionGateway["updates"] = [];
  const subscriptions = new Map<string, ProviderSubscription>();
  const payments = new Map<string, ProviderPayment>();
  const authorizedPayments: TestSubscriptionGateway["authorizedPayments"] = new Map();
  let reject = false;

  const found = <T>(records: Map<string, T>, id: string) => {
    const record = records.get(id);
    if (!record) throw new Error(`Mercado Pago has no ${id}`);
    return structuredClone(record);
  };

  return {
    created,
    updates,
    subscriptions,
    payments,
    authorizedPayments,
    rejectNext: () => {
      reject = true;
    },
    async createSubscription(subscription) {
      created.push(subscription);
      if (reject) {
        reject = false;
        return { ok: false, error: "rejected" };
      }
      const record = {
        id: `preapproval-${created.length}`,
        status: "authorized",
        payerEmail: subscription.payerEmail,
        amountCents: subscription.amountCents,
        nextChargeAt: subscription.startDate ?? clock.now(),
        lastCharge: null,
        modifiedAt: clock.now(),
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
        status: change.status ?? record.status,
        modifiedAt: clock.now(),
      };
      subscriptions.set(id, updated);
      return structuredClone(updated);
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
