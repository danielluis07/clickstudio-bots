import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { eq } from "drizzle-orm";
import { member, memberActivity, organization, user } from "@/db/schema";
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

const seedAdmin = async () =>
  (
    await createPlatformAdmin(db, {
      name: "Admin",
      email: "admin@clickstudio.example",
      password: "admin-password-123",
    })
  ).id;

test("the platform administrator extends a Suspended Tenant's Trial, which lifts the suspension and is recorded", async () => {
  const adminId = await seedAdmin();
  const scope = await seedTenant("tenant");
  await billing(true).launch();
  clock.advance(31 * day);
  await billing(true).sweep();

  const newEnd = new Date("2027-01-20T03:00:00Z");
  expect(await billing(true).extendTrial(adminId, scope.tenantId, newEnd)).toEqual({
    ok: true,
    tenantName: "tenant",
    trialEndsAt: newEnd,
  });
  expect(await billing(true).status(scope)).toEqual({ trialEndsAt: newEnd, suspended: false });
  // The sweep leaves it alone until the new end.
  await billing(true).sweep();
  expect((await billing(true).status(scope)).suspended).toBe(false);

  expect(
    await db
      .select({
        actorUserId: memberActivity.actorUserId,
        action: memberActivity.action,
        subjectId: memberActivity.subjectId,
        occurredAt: memberActivity.occurredAt,
      })
      .from(memberActivity)
      .where(eq(memberActivity.tenantId, scope.tenantId)),
  ).toEqual([
    { actorUserId: adminId, action: "trial.extended", subjectId: null, occurredAt: clock.now() },
  ]);
});

test("extending a Trial is refused to anyone but the platform administrator, for an end not in the future, with billing off and for an unknown Tenant", async () => {
  const adminId = await seedAdmin();
  const scope = await seedTenant("tenant");
  await billing(true).launch();
  const launched = (await billing(true).status(scope)).trialEndsAt;
  const later = new Date("2027-02-01T03:00:00Z");

  expect(await billing(true).extendTrial(scope.userId, scope.tenantId, later)).toEqual({
    ok: false,
    error: "forbidden",
  });
  expect(await billing(true).extendTrial(adminId, scope.tenantId, clock.now())).toEqual({
    ok: false,
    error: "not_future",
  });
  expect(await billing(false).extendTrial(adminId, scope.tenantId, later)).toEqual({
    ok: false,
    error: "billing_disabled",
  });
  expect(await billing(true).extendTrial(adminId, "missing", later)).toEqual({
    ok: false,
    error: "not_found",
  });

  expect((await billing(true).status(scope)).trialEndsAt).toEqual(launched);
  expect(await db.select().from(memberActivity)).toEqual([]);
});

test("the platform administrator lists every Tenant's Trial end and whether it is Suspended", async () => {
  const adminId = await seedAdmin();
  const first = await seedTenant("first");
  await billing(true).launch();
  clock.advance(31 * day);
  await billing(true).sweep();
  const second = await seedTenant("second");

  expect(await billing(true).trials(adminId)).toEqual({
    ok: true,
    tenants: [
      {
        id: first.tenantId,
        name: "first",
        trialEndsAt: new Date("2026-12-31T12:00:00Z"),
        suspended: true,
      },
      { id: second.tenantId, name: "second", trialEndsAt: null, suspended: false },
    ],
  });
  expect(await billing(true).trials(first.userId)).toEqual({ ok: false, error: "forbidden" });
  expect(await billing(false).trials(adminId)).toEqual({ ok: false, error: "billing_disabled" });
});
