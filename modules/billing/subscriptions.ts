import { and, asc, eq, isNotNull, isNull, lt, lte, notExists, or, sql } from "drizzle-orm";
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
const pausedStatus = "paused";
const cancelledStatus = "cancelled";

// The Grace period (ADR 0012): how long after a failed monthly charge the
// Tenant keeps its Bot while Mercado Pago retries.
const graceDays = 7;
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

// A charge attempt of a Subscription: when, and how much, in centavos.
type Charge = { at: Date; amountCents: number };

// A card from the Card Payment Brick: its token, and the last 4 digits the
// Brick showed, when it gives them, kept only to show the owner which card
// pays.
export type BrickCard = { cardToken: string; lastFourDigits?: string | null };

// How many Subscriptions one sweep run re-reads at most (ADR 0007).
const reconcileBatch = 100;

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

  // Mercado Pago may still charge any Subscription that isn't cancelled, so
  // its card can be changed, a paused one included.
  const canChangeCardOf = (stored: { status: string } | null) =>
    Boolean(stored) && stored!.status !== cancelledStatus;

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
  // began before it, and the suspension that Grace period led to, even when
  // the charge is reported only after the sweep Suspended the Tenant. Without
  // a Grace period it ends a suspension that began before it. The card check
  // Mercado Pago makes when subscribing is smaller, and a charge from before
  // either (a replayed notification) settles nothing.
  const recordCharge = async (row: OurSubscription, charge: Charge) => {
    if (charge.amountCents < row.amountCents) return;
    const ours = eq(subscription.mercadoPagoId, row.mercadoPagoId);
    const endedGrace = await db
      .update(subscription)
      .set({ graceEndsAt: null })
      .where(and(ours, lte(subscription.graceEndsAt, graceEndFrom(charge.at))))
      .returning({ id: subscription.id });
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
      .where(
        and(
          eq(organization.id, row.tenantId),
          endedGrace.length ? undefined : lte(organization.suspendedAt, charge.at),
        ),
      );
  };

  // A refused charge of the Subscription's amount starts its Grace period,
  // unless one is already running, a later charge succeeded, or the Tenant is
  // already Suspended (it has no Bot to keep).
  const recordFailedCharge = (row: OurSubscription, failure: Charge) =>
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
      await recordFailedCharge(row, { at: payment.createdAt, amountCents: payment.amountCents });
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
        // Whether "Alterar cartão" shows.
        canChangeCard: canChangeCardOf(stored),
        subscription: stored && {
          active: stored.status === activeStatus,
          status: stored.status,
          payerEmail: stored.payerEmail,
          amountCents: stored.amountCents,
          nextChargeAt: stored.nextChargeAt,
          // Set while a failed charge is overdue: the Bot stops on this date
          // unless a charge succeeds first.
          graceEndsAt: stored.graceEndsAt,
          // The card that pays, or null when nothing is known of it.
          card:
            stored.cardBrand || stored.cardLastFour
              ? { brand: stored.cardBrand, lastFour: stored.cardLastFour }
              : null,
        },
      };
    },

    // Subscribes the scope's Tenant with a card token from the Brick. During
    // the Trial the first charge is on the Trial end; otherwise (Suspended,
    // or billing off) the card is charged now. A Tenant whose Subscription
    // isn't cancelled can't subscribe again.
    async subscribe(scope: TenantScope, card: BrickCard & { payerEmail: string }) {
      if (!(await canManage(scope))) return forbidden;
      if (!config) return { ok: false as const, error: "unavailable" as const };
      if (!canSubscribeOver(await storedSubscription(scope.tenantId)))
        return { ok: false as const, error: "already_subscribed" as const };

      const { trialEndsAt, suspended } = await tenantState(scope.tenantId);
      const startDate = !suspended && trialEndsAt && trialEndsAt > clock.now() ? trialEndsAt : null;
      const created = await config.gateway.createSubscription({
        cardToken: card.cardToken,
        payerEmail: card.payerEmail,
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
        cardBrand: provider.cardBrand,
        cardLastFour: card.lastFourDigits ?? null,
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

    // "Alterar cartão": the owner's new card from the Brick replaces the one
    // that pays the Subscription. Its id, amount and charge date stay, and a
    // paused one is resumed. Mercado Pago doesn't document charging an
    // overdue amount when the card changes: its retries charge the new card,
    // and that charge ends the Grace period as any successful charge does.
    // `overdue` says a failed charge is still waiting for one.
    async changeCard(scope: TenantScope, card: BrickCard) {
      if (!(await canManage(scope))) return forbidden;
      if (!config) return { ok: false as const, error: "unavailable" as const };
      const stored = await storedSubscription(scope.tenantId);
      if (!stored || !canChangeCardOf(stored))
        return { ok: false as const, error: "no_subscription" as const };

      const changed = await config.gateway.changeCard(stored.mercadoPagoId, {
        cardToken: card.cardToken,
        resume: stored.status === pausedStatus,
      });
      if (!changed.ok) return { ok: false as const, error: "card_rejected" as const };
      await db
        .update(subscription)
        .set({
          cardBrand: changed.subscription.cardBrand,
          cardLastFour: card.lastFourDigits ?? null,
        })
        .where(eq(subscription.mercadoPagoId, stored.mercadoPagoId));
      await applySubscription(changed.subscription);
      const after = await storedSubscription(scope.tenantId);
      return { ok: true as const, overdue: Boolean(after?.graceEndsAt) };
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
    // costs nothing. At most `reconcileBatch` per run, the ones re-read
    // longest ago first. The first failure ends the run and is rethrown:
    // Mercado Pago is likely down, and waiting out each call's timeout would
    // use up the sweep's time limit. The failed one goes to the back, so it
    // doesn't block the others next run.
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
        )
        .orderBy(sql`${subscription.reconciledAt} asc nulls first`, asc(subscription.id))
        .limit(reconcileBatch);
      for (const row of due) {
        await db
          .update(subscription)
          .set({ reconciledAt: clock.now() })
          .where(eq(subscription.mercadoPagoId, row.mercadoPagoId));
        await applySubscription(await gateway.fetchSubscription(row.mercadoPagoId));
        const latestCharge = await gateway.fetchLatestAuthorizedPayment(row.mercadoPagoId);
        if (latestCharge?.paymentId)
          await applyPayment(row, await gateway.fetchPayment(latestCharge.paymentId));
      }
    },
  };
};
