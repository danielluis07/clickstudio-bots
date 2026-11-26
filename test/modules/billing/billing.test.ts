import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createBilling } from "@/modules/billing";
import { createPlatformAdmin } from "@/modules/identity";
import { createTenantOnboarding, resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestMailer } from "@/test/support/mailer";

const day = 24 * 60 * 60 * 1000;
let db: Database;
let clock: ReturnType<typeof createTestClock>;

const seedTenant = async (id: string): Promise<TenantScope> => {
  await db.insert(user).values({ id: `owner-${id}`, name: "Owner", email: `${id}@example.com` });
  await db.insert(organization).values({ id, name: id, slug: id });
  await db.insert(member).values({ organizationId: id, userId: `owner-${id}`, role: "owner" });
  return (await resolveTenantScope(db, { userId: `owner-${id}` }))!;
};

const billing = (enabled: boolean) => createBilling({ db, clock, enabled });

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createTestClock(new Date("2026-12-01T12:00:00Z"));
});

afterEach(() => closeTestDatabase(db));

test("launching gives every Tenant without a Trial end 30 days from that day, and running it again changes nothing", async () => {
  const first = await seedTenant("first");
  const second = await seedTenant("second");

  expect(await billing(true).launch()).toEqual({ ok: true, started: 2 });
  expect(await billing(true).status(first)).toEqual({
    trialEndsAt: new Date("2026-12-31T12:00:00Z"),
    suspended: false,
  });

  clock.advance(day);
  expect(await billing(true).launch()).toEqual({ ok: true, started: 0 });
  expect((await billing(true).status(second)).trialEndsAt).toEqual(
    new Date("2026-12-31T12:00:00Z"),
  );
});

test("with billing off, launching is refused and no Tenant has a Trial end", async () => {
  const scope = await seedTenant("tenant");

  expect(await billing(false).launch()).toEqual({ ok: false, error: "billing_disabled" });
  expect(await billing(true).status(scope)).toEqual({ trialEndsAt: null, suspended: false });
});

test("the sweep Suspends a Tenant once its Trial has ended, and not before", async () => {
  const scope = await seedTenant("tenant");
  await billing(true).launch();

  clock.advance(30 * day - 1);
  await billing(true).sweep();
  expect((await billing(true).status(scope)).suspended).toBe(false);

  clock.advance(1);
  await billing(true).sweep();
  expect((await billing(true).status(scope)).suspended).toBe(true);
});

test("the sweep never Suspends a Tenant without a Trial end", async () => {
  const scope = await seedTenant("tenant");

  clock.advance(365 * day);
  await billing(true).sweep();
  expect((await billing(true).status(scope)).suspended).toBe(false);
});

test("with billing off, the sweep Suspends nobody and lifts earlier suspensions", async () => {
  const scope = await seedTenant("tenant");
  await billing(true).launch();
  clock.advance(31 * day);

  await billing(false).sweep();
  expect((await billing(true).status(scope)).suspended).toBe(false);

  // Billing was on, then turned off again.
  await billing(true).sweep();
  expect((await billing(true).status(scope)).suspended).toBe(true);
  expect((await billing(false).status(scope)).suspended).toBe(false);

  await billing(false).sweep();
  expect((await billing(true).status(scope)).suspended).toBe(false);
});

const createTenant = async (enabled: boolean) => {
  const { id: adminId } = await createPlatformAdmin(db, {
    name: "Admin",
    email: "admin@clickstudio.example",
    password: "admin-password-123",
  });
  const onboarding = createTenantOnboarding({
    db,
    clock,
    mailer: createTestMailer(),
    appUrl: "https://bots.example.com",
    trialEndFor: billing(enabled).trialEndFor,
  });
  const created = await onboarding.createTenant(adminId, {
    tenantName: "Clínica Sorriso",
    ownerEmail: "dona@sorriso.example",
  });
  if (!created.ok) throw new Error("setup failed");
  await db.insert(user).values({ id: "owner", name: "Dona", email: "dona@sorriso.example" });
  await db
    .insert(member)
    .values({ organizationId: created.tenantId, userId: "owner", role: "owner" });
  return (await resolveTenantScope(db, { userId: "owner" }))!;
};

test("a Tenant created while billing is on gets a Trial end 30 days after its creation", async () => {
  const scope = await createTenant(true);

  expect((await billing(true).status(scope)).trialEndsAt).toEqual(new Date("2026-12-31T12:00:00Z"));
  // Launching later keeps the Tenant's own Trial end.
  clock.advance(10 * day);
  expect(await billing(true).launch()).toEqual({ ok: true, started: 0 });
});

test("a Tenant created while billing is off gets no Trial end until launch", async () => {
  const scope = await createTenant(false);

  expect((await billing(true).status(scope)).trialEndsAt).toBeNull();
  clock.advance(10 * day);
  await billing(true).launch();
  expect((await billing(true).status(scope)).trialEndsAt).toEqual(new Date("2027-01-10T12:00:00Z"));
});
