import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createBilling, planAmountCents } from "@/modules/billing";
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

const billing = () =>
  createBilling({
    db,
    clock,
    enabled: true,
    subscriptions: { gateway, appUrl: "https://bots.example.com" },
  });

const seedMember = async (
  tenantId: string,
  role: "owner" | "admin" | "member",
  userId = `${tenantId}-${role}`,
): Promise<TenantScope> => {
  await db.insert(user).values({ id: userId, name: role, email: `${userId}@example.com` });
  await db.insert(member).values({ organizationId: tenantId, userId, role });
  return (await resolveTenantScope(db, { userId }))!;
};

// An owner who subscribed during the Trial, now at the Trial end: the day of
// the first monthly charge (2026-12-31T12:00Z).
const subscribedOwner = async () => {
  const owner = await seedMember("tenant", "owner");
  await billing().launch();
  await billing().subscribe(owner, {
    cardToken: "card-token",
    payerEmail: "pagamentos@sorriso.example",
  });
  clock.advance(30 * day);
  return owner;
};

// A charge of the Subscription, made now, in Mercado Pago's records.
const charge = (
  id: string,
  status: string,
  { amountCents = planAmountCents, subscriptionId = "preapproval-1" } = {},
) =>
  gateway.payments.set(id, {
    id,
    status,
    amountCents,
    createdAt: clock.now(),
    approvedAt: status === "approved" ? clock.now() : null,
    subscriptionId,
    externalReference: null,
    modifiedAt: clock.now(),
  });

const notifyPayment = (id: string) => billing().receiveNotification({ type: "payment", id });

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createTestClock(new Date("2026-12-01T12:00:00Z"));
  gateway = createTestSubscriptionGateway(clock);
  await db.insert(organization).values({ id: "tenant", name: "Clínica Sorriso", slug: "tenant" });
});

afterEach(() => closeTestDatabase(db));

test("an owner sees a charge Mercado Pago reports, with its date, amount and status", async () => {
  const owner = await subscribedOwner();
  charge("payment-1", "approved");
  await notifyPayment("payment-1");

  expect(await billing().charges(owner)).toEqual({
    ok: true,
    charges: [
      {
        id: "payment-1",
        status: "approved",
        amountCents: 9990,
        chargedAt: new Date("2026-12-31T12:00:00Z"),
      },
    ],
  });
});

test("only an owner sees the history, and only their own Tenant's charges", async () => {
  const owner = await subscribedOwner();
  const admin = await seedMember("tenant", "admin");
  const memberScope = await seedMember("tenant", "member");
  await db.insert(organization).values({ id: "other", name: "Outra", slug: "other" });
  const otherOwner = await seedMember("other", "owner");
  await billing().subscribe(otherOwner, {
    cardToken: "other-card",
    payerEmail: "dona@outra.example",
  });
  charge("ours", "approved");
  charge("theirs", "approved", { subscriptionId: "preapproval-2" });
  await notifyPayment("ours");
  await notifyPayment("theirs");

  expect(await billing().charges(admin)).toEqual({ ok: false, error: "forbidden" });
  expect(await billing().charges(memberScope)).toEqual({ ok: false, error: "forbidden" });
  expect(await billing().charges(owner)).toMatchObject({ charges: [{ id: "ours" }] });
  expect(await billing().charges(otherOwner)).toMatchObject({ charges: [{ id: "theirs" }] });
});

test("the card check isn't a charge, and one the sweep recovers is listed", async () => {
  const owner = await subscribedOwner();
  charge("card-check", "refunded", { amountCents: 100 });
  await notifyPayment("card-check");
  // Mercado Pago charges the Subscription, but its notification is lost.
  gateway.runCharges();
  await billing().sweep();

  expect(await billing().charges(owner)).toMatchObject({
    charges: [{ id: "payment-2", status: "approved", amountCents: 9990 }],
  });
});

test("a refunded charge shows as refunded, and an older read of it changes nothing", async () => {
  const owner = await subscribedOwner();
  charge("payment-1", "approved");
  const approved = structuredClone(gateway.payments.get("payment-1")!);
  clock.advance(day);
  gateway.payments.set("payment-1", { ...approved, status: "refunded", modifiedAt: clock.now() });
  await notifyPayment("payment-1");

  // The approval's notification, handled late, reads the older state.
  gateway.payments.set("payment-1", approved);
  await notifyPayment("payment-1");

  expect(await billing().charges(owner)).toMatchObject({
    charges: [{ id: "payment-1", status: "refunded" }],
  });
});

test("a charge of a Subscription since replaced still shows its refund", async () => {
  const owner = await subscribedOwner();
  charge("first-month", "approved");
  await notifyPayment("first-month");
  // The owner cancels, and once the paid month ends subscribes again.
  await billing().cancelSubscription(owner);
  clock.advance(32 * day);
  await billing().subscribe(owner, { cardToken: "new-card", payerEmail: "novo@sorriso.example" });

  gateway.payments.set("first-month", {
    ...gateway.payments.get("first-month")!,
    status: "refunded",
    modifiedAt: clock.now(),
  });
  await notifyPayment("first-month");

  expect(await billing().charges(owner)).toMatchObject({
    charges: [{ id: "first-month", status: "refunded" }],
  });
});

test("a refused charge that is later approved shows both attempts, newest first", async () => {
  const owner = await subscribedOwner();
  charge("refused", "rejected");
  await notifyPayment("refused");
  clock.advance(2 * day);
  charge("retry", "approved");
  await notifyPayment("retry");

  expect(await billing().charges(owner)).toEqual({
    ok: true,
    charges: [
      {
        id: "retry",
        status: "approved",
        amountCents: 9990,
        chargedAt: new Date("2027-01-02T12:00:00Z"),
      },
      {
        id: "refused",
        status: "rejected",
        amountCents: 9990,
        chargedAt: new Date("2026-12-31T12:00:00Z"),
      },
    ],
  });
});
