import { and, eq, isNotNull, isNull, lt, lte, notExists, or, sql } from "drizzle-orm";
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

// Mercado Pago's statuses for a Subscription that charges the card, and for
// one that never will again.
const activeStatus = "authorized";
const cancelledStatus = "cancelled";

// The Grace period (ADR 0012): how long after a failed monthly charge the
// Tenant keeps its Bot while Mercado Pago retries.
export const graceDays = 7;
const graceMs = graceDays * 24 * 60 * 60 * 1000;
const graceEndFrom = (failedAt: Date) => new Date(failedAt.getTime() + graceMs);

// Whether the Tenant row's Tenant has an active Subscription. For statements
// on `organization`.
export const hasActiveSubscription = sql<boolean>`exists(
  select 1 from ${subscription}
  where ${subscription.tenantId} = ${organization.id} and ${subscription.status} = ${activeStatus}
)`;

// Whether the Tenant row's Tenant pays for the Plan at `now`: its
// Subscription is active with no charge overdue, or a failed charge's Grace
// period is still running. A Subscription Mercado Pago cancels or pauses once
// its retries are used up pays for nothing after its Grace period. For
// statements on `organization`.
export const paysForPlan = (now: Date) => sql<boolean>`exists(
  select 1 from ${subscription}
  where ${subscription.tenantId} = ${organization.id} and (
    ${subscription.graceEndsAt} > ${now.toISOString()}::timestamptz
    or (${subscription.status} = ${activeStatus} and ${subscription.graceEndsAt} is null)
  )
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
    const [tenant] = await db
      .select({ trialEndsAt: organization.trialEndsAt, suspendedAt: organization.suspendedAt })
      .from(organization)
      .where(eq(organization.id, tenantId));
    return {
      trialEndsAt: enabled ? (tenant?.trialEndsAt ?? null) : null,
      suspended: enabled && Boolean(tenant?.suspendedAt),
    };
  };

  const storedSubscription = async (tenantId: string) => {
    const [row] = await db.select().from(subscription).where(eq(subscription.tenantId, tenantId));
    return row ?? null;
  };

  // A Tenant subscribes when it has no Subscription or only a cancelled one.
  const canSubscribeOver = (stored: { status: string } | null) =>
    !stored || stored.status === cancelledStatus;

  // One of our Subscriptions, found by Mercado Pago's id or by its Tenant.
  // Another preapproval on the account matches nothing.
  const ourSubscription = async (by: { mercadoPagoId: string } | { tenantId: string }) => {
    const [row] = await db
      .select({
        tenantId: subscription.tenantId,
        mercadoPagoId: subscription.mercadoPagoId,
        amountCents: subscription.amountCents,
      })
      .from(subscription)
      .where(
        "mercadoPagoId" in by
          ? eq(subscription.mercadoPagoId, by.mercadoPagoId)
          : eq(subscription.tenantId, by.tenantId),
      );
    return row ?? null;
  };
  type OurSubscription = NonNullable<Awaited<ReturnType<typeof ourSubscription>>>;

  // A successful charge of the Subscription's amount ends a Grace period that
  // began before it, and a suspension that began before it. The card check
  // Mercado Pago makes when subscribing is smaller, and a charge from before
  // either (a replayed notification) settles nothing.
  const recordCharge = async (row: OurSubscription, charge: { at: Date; amountCents: number }) => {
    if (charge.amountCents < row.amountCents) return;
    const ours = eq(subscription.mercadoPagoId, row.mercadoPagoId);
    await db
      .update(subscription)
      .set({ graceEndsAt: null })
      .where(and(ours, lte(subscription.graceEndsAt, graceEndFrom(charge.at))));
    await db
      .update(subscription)
      .set({ lastChargedAt: charge.at })
      .where(
        and(
          ours,
          or(isNull(subscription.lastChargedAt), lt(subscription.lastChargedAt, charge.at)),
        ),
      );
    await db
      .update(organization)
      .set({ suspendedAt: null })
      .where(and(eq(organization.id, row.tenantId), lte(organization.suspendedAt, charge.at)));
  };

  // A refused charge of the Subscription's amount starts its Grace period,
  // unless one is already running, a later charge succeeded, or the Tenant is
  // already Suspended (it has no Bot to keep).
  const recordFailure = (row: OurSubscription, failure: { at: Date; amountCents: number }) =>
    failure.amountCents < row.amountCents
      ? undefined
      : db
          .update(subscription)
          .set({ graceEndsAt: graceEndFrom(failure.at) })
          .where(
            and(
              eq(subscription.mercadoPagoId, row.mercadoPagoId),
              isNull(subscription.graceEndsAt),
              or(isNull(subscription.lastChargedAt), lt(subscription.lastChargedAt, failure.at)),
              notExists(
                db
                  .select({ id: organization.id })
                  .from(organization)
                  .where(
                    and(
                      eq(organization.id, subscription.tenantId),
                      isNotNull(organization.suspendedAt),
                    ),
                  ),
              ),
            ),
          );

  // Applies Mercado Pago's current state to the Subscription it names, unless
  // a newer state is already stored, and counts its latest charge.
  const applySubscription = async (provider: ProviderSubscription) => {
    await db
      .update(subscription)
      .set({
        status: provider.status,
        ...(provider.payerEmail ? { payerEmail: provider.payerEmail } : {}),
        amountCents: provider.amountCents,
        nextChargeAt: provider.nextChargeAt,
        providerModifiedAt: provider.modifiedAt,
      })
      .where(
        and(
          eq(subscription.mercadoPagoId, provider.id),
          lte(subscription.providerModifiedAt, provider.modifiedAt),
        ),
      );
    if (!provider.lastCharge) return;
    const row = await ourSubscription({ mercadoPagoId: provider.id });
    if (row) await recordCharge(row, provider.lastCharge);
  };

  // A charge of one of our Subscriptions: an approved one may end the Grace
  // period and the suspension, a rejected one starts the Grace period.
  const applyPayment = async (row: OurSubscription, payment: ProviderPayment) => {
    if (payment.status === "approved" && payment.approvedAt)
      await recordCharge(row, { at: payment.approvedAt, amountCents: payment.amountCents });
    else if (payment.status === "rejected")
      await recordFailure(row, { at: payment.createdAt, amountCents: payment.amountCents });
  };

  // A payment notification: refreshes the Subscription, then applies the
  // payment.
  const settle = async (row: OurSubscription, payment: ProviderPayment) => {
    await applySubscription(await config!.gateway.fetchSubscription(row.mercadoPagoId));
    await applyPayment(row, payment);
  };

  // The Subscription a payment charged: the one it names, else (since that
  // field isn't in the payments reference) the one of the Tenant its external
  // reference names.
  const subscriptionOfPayment = (payment: ProviderPayment) => {
    if (payment.subscriptionId) return ourSubscription({ mercadoPagoId: payment.subscriptionId });
    if (payment.externalReference) return ourSubscription({ tenantId: payment.externalReference });
    return null;
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
      const stored = await storedSubscription(scope.tenantId);
      return {
        ok: true as const,
        planAmountCents,
        ...(await tenantState(scope.tenantId)),
        available: Boolean(config),
        // Whether the card form shows.
        canSubscribe: canSubscribeOver(stored),
        subscription: stored && {
          active: stored.status === activeStatus,
          status: stored.status,
          payerEmail: stored.payerEmail,
          amountCents: stored.amountCents,
          nextChargeAt: stored.nextChargeAt,
          // Set while a failed charge is overdue: the Bot stops on this date
          // unless a charge succeeds first.
          graceEndsAt: stored.graceEndsAt,
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
      if (!canSubscribeOver(await storedSubscription(scope.tenantId)))
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
      const provider = created.subscription;
      // With a card token Mercado Pago authorizes at once or refuses. Anything
      // else would charge later without us knowing it is ours.
      if (provider.status !== activeStatus) {
        await cancel(provider.id);
        return { ok: false as const, error: "card_rejected" as const };
      }

      const values = {
        mercadoPagoId: provider.id,
        status: provider.status,
        payerEmail: provider.payerEmail ?? card.payerEmail,
        amountCents: provider.amountCents,
        nextChargeAt: provider.nextChargeAt,
        providerModifiedAt: provider.modifiedAt,
        graceEndsAt: null,
        lastChargedAt: null,
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
            setWhere: eq(subscription.status, cancelledStatus),
          })
          .returning({ id: subscription.id });
      } catch (error) {
        await cancel(provider.id).catch(() => {});
        throw error;
      }
      if (!stored) {
        await cancel(provider.id);
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
        await applySubscription(await gateway.fetchSubscription(id));
      } else if (type === "subscription_authorized_payment") {
        const invoice = await gateway.fetchAuthorizedPayment(id);
        const row = await ourSubscription({ mercadoPagoId: invoice.subscriptionId });
        if (row && invoice.paymentId)
          await settle(row, await gateway.fetchPayment(invoice.paymentId));
      } else if (type === "payment") {
        const payment = await gateway.fetchPayment(id);
        const row = await subscriptionOfPayment(payment);
        if (row) await settle(row, payment);
      }
    },

    // Run by the sweep before it enforces deadlines: re-reads from Mercado
    // Pago what a lost notification would have told us. To keep each run
    // cheap (ADR 0011) it reads only active Subscriptions whose charge is due
    // (a successful one moves the next charge a month ahead) or that have a
    // Grace period; one on Trial, already charged this month, or cancelled
    // costs nothing. One Subscription's failure doesn't stop the others; the
    // first is rethrown at the end.
    async reconcile() {
      if (!config) return;
      const { gateway } = config;
      const due = await db
        .select({
          tenantId: subscription.tenantId,
          mercadoPagoId: subscription.mercadoPagoId,
          amountCents: subscription.amountCents,
        })
        .from(subscription)
        .where(
          and(
            eq(subscription.status, activeStatus),
            or(isNotNull(subscription.graceEndsAt), lte(subscription.nextChargeAt, clock.now())),
          ),
        );
      const failures: unknown[] = [];
      for (const row of due) {
        try {
          await applySubscription(await gateway.fetchSubscription(row.mercadoPagoId));
          const invoice = await gateway.fetchLatestAuthorizedPayment(row.mercadoPagoId);
          if (invoice?.paymentId)
            await applyPayment(row, await gateway.fetchPayment(invoice.paymentId));
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length) throw failures[0];
    },
  };
};
