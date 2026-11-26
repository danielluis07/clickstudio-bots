import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { organization, subscription } from "@/db/schema";
import { isPlatformAdmin } from "@/modules/identity";
import { forbidden, isOwner, type TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import type {
  ProviderPayment,
  ProviderSubscription,
  SubscriptionGateway,
} from "@/modules/billing/gateway";

// The Plan: one flat monthly price, in centavos (R$ 99,90).
export const planAmountCents = 9990;
const planReason = "ClickStudio Bots: plano mensal";

// Mercado Pago's status for a Subscription that charges the card.
const activeStatus = "authorized";

// Whether the Tenant row's Tenant has an active Subscription. For statements
// on `organization`.
export const hasActiveSubscription = sql<boolean>`exists(
  select 1 from ${subscription}
  where ${subscription.tenantId} = ${organization.id} and ${subscription.status} = ${activeStatus}
)`;

export type SubscriptionsConfig = {
  gateway: SubscriptionGateway;
  // The billing page's origin, for Mercado Pago's `back_url`.
  appUrl: string;
};

// The owner's side of billing: the billing page, subscribing with a card
// token from the Card Payment Brick, and Mercado Pago's notifications.
// Without `config` (no Mercado Pago credentials) the page says so and
// subscribing is refused.
export const createSubscriptions = ({
  db,
  clock,
  enabled,
  config,
}: {
  db: Database;
  clock: Clock;
  enabled: boolean;
  config: SubscriptionsConfig | null;
}) => {
  // Only owners subscribe (ADR 0012). With billing off, only the platform
  // administrator does, to try it before launch.
  const canManage = async (scope: TenantScope) =>
    isOwner(scope) && (enabled || (await isPlatformAdmin(db, scope.userId)));

  // With billing off no Trial counts down and nobody is Suspended.
  const tenantState = async (tenantId: string) => {
    const [found] = await db
      .select({ trialEndsAt: organization.trialEndsAt, suspendedAt: organization.suspendedAt })
      .from(organization)
      .where(eq(organization.id, tenantId));
    return {
      trialEndsAt: enabled ? (found?.trialEndsAt ?? null) : null,
      suspended: enabled && Boolean(found?.suspendedAt),
    };
  };

  const storedSubscription = async (tenantId: string) => {
    const [found] = await db.select().from(subscription).where(eq(subscription.tenantId, tenantId));
    return found ?? null;
  };

  // Applies Mercado Pago's current state to the Subscription it names, unless
  // a newer state is already stored. Another preapproval on the account
  // matches nothing.
  const sync = (found: ProviderSubscription) =>
    db
      .update(subscription)
      .set({
        status: found.status,
        ...(found.payerEmail ? { payerEmail: found.payerEmail } : {}),
        amountCents: found.amountCents,
        nextChargeAt: found.nextChargeAt,
        providerModifiedAt: found.modifiedAt,
      })
      .where(
        and(
          eq(subscription.mercadoPagoId, found.id),
          lte(subscription.providerModifiedAt, found.modifiedAt),
        ),
      );

  // A payment of one of our Subscriptions. An approved charge of the Plan's
  // amount, approved after the Tenant was Suspended, ends the suspension. The
  // card check Mercado Pago makes when subscribing is smaller, and a payment
  // from before the suspension (a replayed notification) settles nothing.
  const settle = async (subscriptionId: string, payment: ProviderPayment) => {
    const [found] = await db
      .select({ tenantId: subscription.tenantId, amountCents: subscription.amountCents })
      .from(subscription)
      .where(eq(subscription.mercadoPagoId, subscriptionId));
    if (!found) return;
    await sync(await config!.gateway.fetchSubscription(subscriptionId));
    if (payment.status !== "approved" || !payment.approvedAt) return;
    if (payment.amountCents < found.amountCents) return;
    await db
      .update(organization)
      .set({ suspendedAt: null })
      .where(
        and(eq(organization.id, found.tenantId), lte(organization.suspendedAt, payment.approvedAt)),
      );
  };

  // Cancels a preapproval we won't keep. A failure here leaves a Subscription
  // in Mercado Pago's panel that charges nobody's Tenant, so it is rethrown
  // only when nothing else is.
  const cancel = (id: string) => config!.gateway.updateSubscription(id, { status: "cancelled" });

  return {
    canManage,

    // What the billing page shows.
    async checkout(scope: TenantScope) {
      if (!(await canManage(scope))) return forbidden;
      const found = await storedSubscription(scope.tenantId);
      return {
        ok: true as const,
        planAmountCents,
        ...(await tenantState(scope.tenantId)),
        available: Boolean(config),
        subscription: found && {
          active: found.status === activeStatus,
          status: found.status,
          payerEmail: found.payerEmail,
          amountCents: found.amountCents,
          nextChargeAt: found.nextChargeAt,
        },
      };
    },

    // Subscribes the scope's Tenant with a card token from the Brick. During
    // the Trial the first charge is on the Trial end; otherwise (Suspended,
    // or billing off) the card is charged now. A Tenant whose Subscription
    // isn't cancelled can't subscribe again.
    async subscribe(scope: TenantScope, card: { cardToken: string; payerEmail: string }) {
      if (!(await canManage(scope))) return forbidden;
      if (!config) return { ok: false as const, error: "unavailable" as const };
      const existing = await storedSubscription(scope.tenantId);
      if (existing && existing.status !== "cancelled")
        return { ok: false as const, error: "already_subscribed" as const };

      const { trialEndsAt, suspended } = await tenantState(scope.tenantId);
      const startDate = !suspended && trialEndsAt && trialEndsAt > clock.now() ? trialEndsAt : null;
      const created = await config.gateway.createSubscription({
        ...card,
        amountCents: planAmountCents,
        startDate,
        reason: planReason,
        externalReference: scope.tenantId,
        backUrl: `${config.appUrl}/painel/assinatura`,
      });
      if (!created.ok) return { ok: false as const, error: "card_rejected" as const };
      const found = created.subscription;
      // With a card token Mercado Pago authorizes at once or refuses. Anything
      // else would charge later without us knowing it is ours.
      if (found.status !== activeStatus) {
        await cancel(found.id);
        return { ok: false as const, error: "card_rejected" as const };
      }

      const values = {
        mercadoPagoId: found.id,
        status: found.status,
        payerEmail: found.payerEmail ?? card.payerEmail,
        amountCents: found.amountCents,
        nextChargeAt: found.nextChargeAt,
        providerModifiedAt: found.modifiedAt,
      };
      let stored: { id: string } | undefined;
      try {
        // Replaces only a cancelled Subscription, so of two subscribes at once
        // one is stored and the other cancelled below.
        [stored] = await db
          .insert(subscription)
          .values({ tenantId: scope.tenantId, ...values })
          .onConflictDoUpdate({
            target: subscription.tenantId,
            set: values,
            setWhere: eq(subscription.status, "cancelled"),
          })
          .returning({ id: subscription.id });
      } catch (error) {
        await cancel(found.id).catch(() => {});
        throw error;
      }
      if (!stored) {
        await cancel(found.id);
        return { ok: false as const, error: "already_subscribed" as const };
      }
      return { ok: true as const, firstChargeAt: startDate, suspended };
    },

    // A verified Mercado Pago notification. The body is only a signal: the
    // resource is fetched from Mercado Pago and applied idempotently, so a
    // repeated or out-of-order notification changes nothing more. Topics
    // other than these are ignored.
    async receiveNotification({ type, id }: { type: string; id: string }) {
      if (!config) return;
      const { gateway } = config;
      if (type === "subscription_preapproval") {
        await sync(await gateway.fetchSubscription(id));
      } else if (type === "subscription_authorized_payment") {
        const invoice = await gateway.fetchAuthorizedPayment(id);
        if (invoice.paymentId)
          await settle(invoice.subscriptionId, await gateway.fetchPayment(invoice.paymentId));
      } else if (type === "payment") {
        const payment = await gateway.fetchPayment(id);
        if (payment.subscriptionId) await settle(payment.subscriptionId, payment);
      }
    },
  };
};
