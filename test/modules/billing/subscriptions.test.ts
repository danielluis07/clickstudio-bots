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
    subscription: {
      active: true,
      status: "authorized",
      payerEmail: "pagamentos@sorriso.example",
      amountCents: 9990,
      nextChargeAt: new Date("2026-12-31T12:00:00Z"),
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

test("without Mercado Pago configured the page says so and subscribing is refused", async () => {
  const owner = await seedMember("owner");
  const unconfigured = createBilling({ db, clock, enabled: true });

  expect(await unconfigured.checkout(owner)).toMatchObject({ ok: true, available: false });
  expect(await unconfigured.subscribe(owner, card)).toEqual({ ok: false, error: "unavailable" });
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
