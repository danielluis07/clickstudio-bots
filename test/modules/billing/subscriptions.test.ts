import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createBilling, planAmountCents } from "@/modules/billing";
import { createPlatformAdmin } from "@/modules/identity";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import {
  createTestSubscriptionGateway,
  type TestSubscriptionGateway,
} from "@/test/support/subscription-gateway";

const day = 24 * 60 * 60 * 1000;
let db: Database;
let clock: ReturnType<typeof createTestClock>;
let gateway: TestSubscriptionGateway;

const billing = (enabled = true) =>
  createBilling({
    db,
    clock,
    enabled,
    subscriptions: { gateway, appUrl: "https://bots.example.com" },
  });

const seedTenant = async () => {
  await db.insert(organization).values({ id: "tenant", name: "Clínica Sorriso", slug: "tenant" });
};

const seedMember = async (
  role: "owner" | "admin" | "member",
  { platformAdmin = false, userId = `${role}-user` } = {},
): Promise<TenantScope> => {
  await db.insert(user).values({
    id: userId,
    name: role,
    email: `${userId}@sorriso.example`,
    role: platformAdmin ? "admin" : "user",
  });
  await db.insert(member).values({ organizationId: "tenant", userId, role });
  return (await resolveTenantScope(db, { userId }))!;
};

const card = { cardToken: "card-token", payerEmail: "pagamentos@sorriso.example" };

// A second Tenant and its owner.
const seedOtherTenant = async (values: { trialEndsAt?: Date } = {}) => {
  await db.insert(organization).values({ id: "other", name: "Outra", slug: "other", ...values });
  await db.insert(user).values({ id: "other-owner", name: "Dona", email: "dona@outra.example" });
  await db.insert(member).values({ organizationId: "other", userId: "other-owner", role: "owner" });
  return (await resolveTenantScope(db, { userId: "other-owner" }))!;
};

// An owner who subscribed during the Trial, now at the Trial end: the day of
// the first monthly charge (2026-12-31T12:00Z).
const subscribedAtTrialEnd = async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  await billing().subscribe(owner, card);
  clock.advance(30 * day);
  return owner;
};

// A charge of the Subscription, made now, in Mercado Pago's records.
const charge = (id: string, status: "approved" | "rejected", amountCents = planAmountCents) =>
  gateway.payments.set(id, {
    id,
    status,
    amountCents,
    createdAt: clock.now(),
    approvedAt: status === "approved" ? clock.now() : null,
    subscriptionId: "preapproval-1",
    externalReference: null,
  });

const suspended = async (scope: TenantScope) => (await billing().status(scope)).suspended;

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createTestClock(new Date("2026-12-01T12:00:00Z"));
  gateway = createTestSubscriptionGateway(clock);
  await seedTenant();
});

afterEach(() => closeTestDatabase(db));

test("an owner on Trial subscribes: the Subscription is active and the first charge is on the Trial end", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  clock.advance(10 * day);

  expect(await billing().subscribe(owner, card)).toMatchObject({
    ok: true,
    firstChargeAt: new Date("2026-12-31T12:00:00Z"),
  });
  expect(gateway.created).toEqual([
    {
      ...card,
      amountCents: planAmountCents,
      startDate: new Date("2026-12-31T12:00:00Z"),
      reason: "ClickStudio Bots: plano mensal",
      externalReference: "tenant",
      backUrl: "https://bots.example.com/painel/assinatura",
    },
  ]);
  expect(await billing().checkout(owner)).toEqual({
    ok: true,
    planAmountCents: 9990,
    trialEndsAt: new Date("2026-12-31T12:00:00Z"),
    suspended: false,
    available: true,
    canSubscribe: false,
    canChangeCard: true,
    subscription: {
      active: true,
      status: "authorized",
      payerEmail: "pagamentos@sorriso.example",
      amountCents: 9990,
      nextChargeAt: new Date("2026-12-31T12:00:00Z"),
      graceEndsAt: null,
      card: { brand: "visa", lastFour: null },
    },
  });

  // Its Trial ends, and the sweep leaves it alone.
  clock.advance(30 * day);
  await billing().sweep();
  expect((await billing().status(owner)).suspended).toBe(false);
});

test("a Suspended owner is charged now, and the suspension ends once Mercado Pago approves the charge", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  clock.advance(31 * day);
  await billing().sweep();

  expect(await billing().subscribe(owner, card)).toMatchObject({ ok: true, firstChargeAt: null });
  expect(gateway.created[0].startDate).toBeNull();
  // Subscribed, but not yet paid.
  expect((await billing().status(owner)).suspended).toBe(true);

  clock.advance(60_000);
  gateway.payments.set("payment-1", {
    id: "payment-1",
    status: "approved",
    amountCents: planAmountCents,
    createdAt: clock.now(),
    approvedAt: clock.now(),
    subscriptionId: "preapproval-1",
    externalReference: null,
  });
  await billing().receiveNotification({ type: "payment", id: "payment-1" });
  expect((await billing().status(owner)).suspended).toBe(false);

  // The same notification again changes nothing more.
  await billing().receiveNotification({ type: "payment", id: "payment-1" });
  expect((await billing().status(owner)).suspended).toBe(false);
  expect((await billing().checkout(owner)).ok).toBe(true);
});

test("an approved authorized payment ends the suspension too", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  clock.advance(31 * day);
  await billing().sweep();
  await billing().subscribe(owner, card);

  gateway.payments.set("payment-1", {
    id: "payment-1",
    status: "approved",
    amountCents: planAmountCents,
    createdAt: clock.now(),
    approvedAt: clock.now(),
    // The payment itself doesn't name the Subscription; its invoice does.
    subscriptionId: null,
    externalReference: null,
  });
  gateway.authorizedPayments.set("invoice-1", {
    subscriptionId: "preapproval-1",
    paymentId: "payment-1",
  });
  await billing().receiveNotification({ type: "subscription_authorized_payment", id: "invoice-1" });
  expect((await billing().status(owner)).suspended).toBe(false);
});

test("a preapproval notification showing the first charge ends the suspension", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  clock.advance(31 * day);
  await billing().sweep();
  await billing().subscribe(owner, card);

  clock.advance(60_000);
  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    lastCharge: { at: clock.now(), amountCents: planAmountCents },
    modifiedAt: clock.now(),
  });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  expect((await billing().status(owner)).suspended).toBe(false);
});

test("a payment that names only the Tenant ends the suspension", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  clock.advance(31 * day);
  await billing().sweep();
  await billing().subscribe(owner, card);

  clock.advance(60_000);
  gateway.payments.set("payment-1", {
    id: "payment-1",
    status: "approved",
    amountCents: planAmountCents,
    createdAt: clock.now(),
    approvedAt: clock.now(),
    subscriptionId: null,
    externalReference: "tenant",
  });
  await billing().receiveNotification({ type: "payment", id: "payment-1" });
  expect((await billing().status(owner)).suspended).toBe(false);
});

test("a charge that doesn't pay for the Plan leaves the Tenant Suspended", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  clock.advance(31 * day);
  await billing().sweep();
  const suspendedAt = clock.now();
  await billing().subscribe(owner, card);

  const payment = {
    status: "approved",
    amountCents: planAmountCents,
    createdAt: new Date(suspendedAt.getTime() + 60_000),
    approvedAt: new Date(suspendedAt.getTime() + 60_000),
    subscriptionId: "preapproval-1",
    externalReference: null,
  };
  gateway.payments.set("refused", { ...payment, id: "refused", status: "rejected" });
  // Mercado Pago's small card check, refunded.
  gateway.payments.set("card-check", { ...payment, id: "card-check", amountCents: 100 });
  gateway.payments.set("earlier", {
    ...payment,
    id: "earlier",
    approvedAt: new Date(suspendedAt.getTime() - day),
  });
  gateway.payments.set("other", { ...payment, id: "other", subscriptionId: "someone-else" });
  for (const id of ["refused", "card-check", "earlier", "other"])
    await billing().receiveNotification({ type: "payment", id });

  expect((await billing().status(owner)).suspended).toBe(true);
});

test("a preapproval notification stores Mercado Pago's current state, and an older read changes nothing", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  await billing().subscribe(owner, card);

  clock.advance(day);
  const current = gateway.subscriptions.get("preapproval-1")!;
  gateway.subscriptions.set("preapproval-1", {
    ...current,
    status: "cancelled",
    modifiedAt: clock.now(),
  });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { active: false, status: "cancelled" },
  });

  gateway.subscriptions.set("preapproval-1", current);
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  expect(await billing().checkout(owner)).toMatchObject({ subscription: { status: "cancelled" } });

  // Another preapproval on the account, and other topics, are ignored.
  gateway.subscriptions.set("someone-else", { ...current, id: "someone-else" });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "someone-else" });
  await billing().receiveNotification({ type: "merchant_order", id: "1" });
  expect(await billing().checkout(owner)).toMatchObject({ subscription: { status: "cancelled" } });
});

test("a failed charge starts a 7-day Grace period: the Bot keeps replying, and the sweep Suspends once it ends unpaid", async () => {
  const owner = await subscribedAtTrialEnd();

  charge("payment-1", "rejected");
  await billing().receiveNotification({ type: "payment", id: "payment-1" });
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { active: true, graceEndsAt: new Date("2027-01-07T12:00:00Z") },
  });

  clock.advance(7 * day - 1);
  await billing().sweep();
  expect(await suspended(owner)).toBe(false);

  clock.advance(1);
  await billing().sweep();
  expect(await suspended(owner)).toBe(true);
});

test("a successful retry within the Grace period clears it, and replaying the refusal doesn't start it again", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused" });

  clock.advance(3 * day);
  charge("retry", "approved");
  await billing().receiveNotification({ type: "payment", id: "retry" });
  expect(await billing().checkout(owner)).toMatchObject({ subscription: { graceEndsAt: null } });

  await billing().receiveNotification({ type: "payment", id: "refused" });
  expect(await billing().checkout(owner)).toMatchObject({ subscription: { graceEndsAt: null } });
  clock.advance(5 * day);
  await billing().sweep();
  expect(await suspended(owner)).toBe(false);
});

test("a refused card check, or a refusal while Suspended, starts no Grace period", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("card-check", "rejected", 100);
  await billing().receiveNotification({ type: "payment", id: "card-check" });
  expect(await billing().checkout(owner)).toMatchObject({ subscription: { graceEndsAt: null } });

  // Suspended after a first Grace period, the next refusal changes nothing.
  charge("refused", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused" });
  clock.advance(7 * day);
  await billing().sweep();
  expect(await suspended(owner)).toBe(true);
  const { subscription } = (await billing().checkout(owner)) as {
    subscription: { graceEndsAt: Date };
  };
  charge("refused-again", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused-again" });
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { graceEndsAt: subscription.graceEndsAt },
  });

  // A late successful retry ends both.
  clock.advance(day);
  charge("late", "approved");
  await billing().receiveNotification({ type: "payment", id: "late" });
  expect(await suspended(owner)).toBe(false);
  expect(await billing().checkout(owner)).toMatchObject({ subscription: { graceEndsAt: null } });
});

test("a failed charge reported through its authorized payment starts the Grace period too", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  gateway.payments.get("refused")!.subscriptionId = null;
  gateway.authorizedPayments.set("invoice-1", {
    subscriptionId: "preapproval-1",
    paymentId: "refused",
  });

  await billing().receiveNotification({ type: "subscription_authorized_payment", id: "invoice-1" });
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { graceEndsAt: new Date("2027-01-07T12:00:00Z") },
  });
});

test("a Subscription Mercado Pago cancels during the Grace period keeps the Bot until it ends", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused" });

  clock.advance(5 * day);
  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    status: "cancelled",
    modifiedAt: clock.now(),
  });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  await billing().sweep();
  expect(await suspended(owner)).toBe(false);

  clock.advance(2 * day);
  await billing().sweep();
  expect(await suspended(owner)).toBe(true);
});

test("with the failure's webhook dropped, the sweep finds the refused charge and starts the Grace period", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  gateway.authorizedPayments.set("invoice-1", {
    subscriptionId: "preapproval-1",
    paymentId: "refused",
  });

  clock.advance(30 * 60_000);
  await billing().sweep();
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { graceEndsAt: new Date("2027-01-07T12:00:00Z") },
  });
  expect(await suspended(owner)).toBe(false);
});

test("with the retry's webhook dropped, the sweep sees the charge and clears the Grace period", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused" });

  clock.advance(3 * day);
  charge("retry", "approved");
  gateway.authorizedPayments.set("invoice-1", {
    subscriptionId: "preapproval-1",
    paymentId: "retry",
  });
  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    nextChargeAt: new Date("2027-01-31T12:00:00Z"),
    lastCharge: { at: clock.now(), amountCents: planAmountCents },
    modifiedAt: clock.now(),
  });
  await billing().sweep();
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { graceEndsAt: null, nextChargeAt: new Date("2027-01-31T12:00:00Z") },
  });

  clock.advance(5 * day);
  await billing().sweep();
  expect(await suspended(owner)).toBe(false);
});

test("with the cancellation's webhook dropped, the sweep stores Mercado Pago's status and Suspends once the Grace period ends", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused" });

  clock.advance(7 * day);
  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    status: "cancelled",
    modifiedAt: clock.now(),
  });
  await billing().sweep();
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { status: "cancelled" },
  });
  expect(await suspended(owner)).toBe(true);
});

test("the sweep fetches only Subscriptions with a charge due or a Grace period", async () => {
  const fetched: string[] = [];
  const fetchSubscription = gateway.fetchSubscription;
  gateway.fetchSubscription = async (id) => {
    fetched.push(id);
    return fetchSubscription(id);
  };
  const owner = await seedMember("owner");
  await billing().launch();
  await billing().subscribe(owner, card);

  // On Trial, the first charge is weeks away.
  await billing().sweep();
  expect(fetched).toEqual([]);

  // Charged, the next charge is a month away.
  clock.advance(30 * day);
  await billing().sweep();
  expect(fetched).toEqual(["preapproval-1"]);
  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    nextChargeAt: new Date("2027-01-31T12:00:00Z"),
    lastCharge: { at: clock.now(), amountCents: planAmountCents },
    modifiedAt: clock.now(),
  });
  clock.advance(30 * 60_000);
  await billing().sweep();
  await billing().sweep();
  expect(fetched).toEqual(["preapproval-1", "preapproval-1"]);

  // Cancelled, it is never charged again.
  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    status: "cancelled",
    modifiedAt: clock.now(),
  });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  fetched.length = 0;
  clock.advance(40 * day);
  await billing().sweep();
  expect(fetched).toEqual([]);
});

test("a retry approved before the Grace period ends lifts the suspension even when its webhook arrives later", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused" });

  clock.advance(7 * day - 60_000);
  charge("retry", "approved");
  clock.advance(2 * 60_000);
  await billing().sweep();
  expect(await suspended(owner)).toBe(true);

  await billing().receiveNotification({ type: "payment", id: "retry" });
  expect(await suspended(owner)).toBe(false);
});

test("with Mercado Pago failing, the sweep stops at the first failure and starts with another Subscription next run", async () => {
  const owner = await seedMember("owner");
  const other = await seedOtherTenant();
  await billing().launch();
  await billing().subscribe(owner, card);
  await billing().subscribe(other, card);
  clock.advance(30 * day);
  const fetched: string[] = [];
  const fetchSubscription = gateway.fetchSubscription;
  gateway.fetchSubscription = async (id) => {
    fetched.push(id);
    if (fetched.length === 1) throw new Error("Mercado Pago is down");
    return fetchSubscription(id);
  };

  await expect(billing().sweep()).rejects.toThrow("Mercado Pago is down");
  expect(fetched).toHaveLength(1);

  const [failed] = fetched;
  const untried = failed === "preapproval-1" ? "preapproval-2" : "preapproval-1";
  clock.advance(30 * 60_000);
  await billing().sweep();
  expect(fetched.slice(1)).toEqual([untried, failed]);
});

test("with Mercado Pago down, the sweep still Suspends and then reports the failure", async () => {
  const owner = await subscribedAtTrialEnd();
  gateway.fetchSubscription = async () => {
    throw new Error("Mercado Pago is down");
  };
  // Trial ended, no Subscription: Suspended despite Mercado Pago being down.
  const other = await seedOtherTenant({ trialEndsAt: clock.now() });

  await expect(billing().sweep()).rejects.toThrow("Mercado Pago is down");
  expect(await suspended(owner)).toBe(false);
  expect(await suspended(other)).toBe(true);
});

test("admins and members can't open the billing page or subscribe", async () => {
  await billing().launch();
  for (const role of ["admin", "member"] as const) {
    const scope = await seedMember(role);
    expect(await billing().canManage(scope)).toBe(false);
    expect(await billing().checkout(scope)).toEqual({ ok: false, error: "forbidden" });
    expect(await billing().subscribe(scope, card)).toEqual({ ok: false, error: "forbidden" });
  }
  expect(gateway.created).toEqual([]);
});

test("with billing off, only a platform administrator who owns the Tenant sees the page, and is charged now", async () => {
  const owner = await seedMember("owner");
  expect(await billing(false).canManage(owner)).toBe(false);
  expect(await billing(false).subscribe(owner, card)).toEqual({ ok: false, error: "forbidden" });

  const admin = await seedMember("owner", { platformAdmin: true, userId: "platform-admin" });
  expect(await billing(false).canManage(admin)).toBe(true);
  expect(await billing(false).subscribe(admin, card)).toMatchObject({
    ok: true,
    firstChargeAt: null,
  });
});

test("a Tenant with a Subscription can't subscribe again until it is cancelled", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  await billing().subscribe(owner, card);

  expect(await billing().subscribe(owner, card)).toEqual({
    ok: false,
    error: "already_subscribed",
  });
  expect(gateway.created).toHaveLength(1);

  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    status: "cancelled",
    modifiedAt: new Date(clock.now().getTime() + 1),
  });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  expect(await billing().subscribe(owner, card)).toMatchObject({ ok: true });
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { active: true, status: "authorized" },
  });
});

test("two subscribes at once store one Subscription and cancel the other preapproval", async () => {
  const owner = await seedMember("owner");
  await billing().launch();

  const results = await Promise.all([
    billing().subscribe(owner, card),
    billing().subscribe(owner, card),
  ]);
  expect(results.map(({ ok }) => ok).sort()).toEqual([false, true]);
  expect(results).toContainEqual({ ok: false, error: "already_subscribed" });
  expect(gateway.created).toHaveLength(2);
  expect(gateway.updates).toHaveLength(1);
  expect(gateway.updates[0].change).toEqual({ status: "cancelled" });
});

test("a refused card stores nothing", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  gateway.rejectNext();

  expect(await billing().subscribe(owner, card)).toEqual({ ok: false, error: "card_rejected" });
  expect((await billing().checkout(owner)) as { subscription: unknown }).toMatchObject({
    subscription: null,
  });
});

test("a Subscription that Mercado Pago doesn't authorize at once is cancelled, not stored", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  const create = gateway.createSubscription;
  gateway.createSubscription = async (subscription) => {
    const created = await create(subscription);
    return created.ok
      ? { ok: true, subscription: { ...created.subscription, status: "pending" } }
      : created;
  };

  expect(await billing().subscribe(owner, card)).toEqual({ ok: false, error: "card_rejected" });
  expect(gateway.updates).toEqual([{ id: "preapproval-1", change: { status: "cancelled" } }]);
  expect(await billing().checkout(owner)).toMatchObject({ subscription: null });
});

test("an owner changes the card: the same Subscription keeps its amount and next charge, and shows the new card masked", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  await billing().subscribe(owner, { ...card, lastFourDigits: "3311" });
  expect(await billing().checkout(owner)).toMatchObject({
    canChangeCard: true,
    subscription: { card: { brand: "visa", lastFour: "3311" } },
  });
  clock.advance(10 * day);

  expect(
    await billing().changeCard(owner, { cardToken: "new-card-token", lastFourDigits: "5682" }),
  ).toEqual({ ok: true, overdue: false });
  expect(gateway.cardChanges).toEqual([
    { id: "preapproval-1", cardToken: "new-card-token", resume: false },
  ]);
  expect(await billing().checkout(owner)).toMatchObject({
    canSubscribe: false,
    canChangeCard: true,
    subscription: {
      active: true,
      amountCents: 9990,
      nextChargeAt: new Date("2026-12-31T12:00:00Z"),
      card: { brand: "master", lastFour: "5682" },
    },
  });
});

test("during a Grace period, a charge on the new card ends it, even after the sweep Suspended the Tenant", async () => {
  const owner = await subscribedAtTrialEnd();
  charge("refused", "rejected");
  await billing().receiveNotification({ type: "payment", id: "refused" });
  clock.advance(7 * day);
  await billing().sweep();
  expect(await suspended(owner)).toBe(true);

  expect(await billing().changeCard(owner, { cardToken: "new-card-token" })).toEqual({
    ok: true,
    overdue: true,
  });
  clock.advance(60_000);
  charge("retry-on-new-card", "approved");
  await billing().receiveNotification({ type: "payment", id: "retry-on-new-card" });

  expect(await suspended(owner)).toBe(false);
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { graceEndsAt: null, card: { brand: "master", lastFour: null } },
  });
});

test("a paused Subscription is resumed with the new card", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  await billing().subscribe(owner, card);
  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    status: "paused",
    modifiedAt: new Date(clock.now().getTime() + 1),
  });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  clock.advance(60_000);

  expect(await billing().changeCard(owner, { cardToken: "new-card-token" })).toMatchObject({
    ok: true,
  });
  expect(gateway.cardChanges).toEqual([
    { id: "preapproval-1", cardToken: "new-card-token", resume: true },
  ]);
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { active: true, status: "authorized" },
  });
});

test("a refused new card keeps the old one", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  await billing().subscribe(owner, { ...card, lastFourDigits: "3311" });
  gateway.rejectNext();

  expect(
    await billing().changeCard(owner, { cardToken: "new-card-token", lastFourDigits: "5682" }),
  ).toEqual({ ok: false, error: "card_rejected" });
  expect(await billing().checkout(owner)).toMatchObject({
    subscription: { active: true, card: { brand: "visa", lastFour: "3311" } },
  });
});

test("only an owner changes the card, and only of a Subscription that isn't cancelled", async () => {
  const owner = await seedMember("owner");
  await billing().launch();
  expect(await billing().checkout(owner)).toMatchObject({ canChangeCard: false });
  expect(await billing().changeCard(owner, { cardToken: "new-card-token" })).toEqual({
    ok: false,
    error: "no_subscription",
  });

  await billing().subscribe(owner, card);
  for (const role of ["admin", "member"] as const) {
    const scope = await seedMember(role);
    expect(await billing().changeCard(scope, { cardToken: "new-card-token" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  }

  gateway.subscriptions.set("preapproval-1", {
    ...gateway.subscriptions.get("preapproval-1")!,
    status: "cancelled",
    modifiedAt: new Date(clock.now().getTime() + 1),
  });
  await billing().receiveNotification({ type: "subscription_preapproval", id: "preapproval-1" });
  expect(await billing().checkout(owner)).toMatchObject({ canChangeCard: false });
  expect(await billing().changeCard(owner, { cardToken: "new-card-token" })).toEqual({
    ok: false,
    error: "no_subscription",
  });
  expect(gateway.cardChanges).toEqual([]);
});

test("without Mercado Pago configured the page says so and subscribing is refused", async () => {
  const owner = await seedMember("owner");
  const unconfigured = createBilling({ db, clock, enabled: true });

  expect(await unconfigured.checkout(owner)).toMatchObject({ ok: true, available: false });
  expect(await unconfigured.subscribe(owner, card)).toEqual({ ok: false, error: "unavailable" });
  expect(await unconfigured.changeCard(owner, { cardToken: "new-card-token" })).toEqual({
    ok: false,
    error: "unavailable",
  });
});

test("a Tenant with an active Subscription has no Trial to extend", async () => {
  const owner = await seedMember("owner");
  const { id: adminId } = await createPlatformAdmin(db, {
    name: "Admin",
    email: "admin@clickstudio.example",
    password: "admin-password-123",
  });
  await billing().launch();
  await billing().subscribe(owner, card);

  expect(
    await billing().extendTrial(adminId, "tenant", new Date(clock.now().getTime() + 40 * day)),
  ).toEqual({ ok: false, error: "subscribed" });
});
