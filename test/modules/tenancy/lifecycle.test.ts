import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import {
  account,
  channel,
  contact,
  inboxEvent,
  member,
  organization,
  session,
  user,
  verification,
} from "@/db/schema";
import {
  createChannelService,
  findChannelCredential,
  resolveChannelPhoneNumber,
} from "@/modules/channels";
import { createReplyGate } from "@/modules/bot";
import { recordInboundTextMessage } from "@/modules/conversations";
import { createTestBotAllowance } from "@/test/support/bot";
import {
  createTenantLifecycle,
  createTenantOnboarding,
  pruneCanceledTenants,
  resolveTenantScope,
} from "@/modules/tenancy";
import { createUserRepository } from "@/modules/identity";
import { createDailyCronRoute } from "@/server/daily-cron";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestMailer } from "@/test/support/mailer";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const setup = async () => {
  db = await createTestDatabase();
  const tenant = await seedLiveBot(db);
  const other = await seedLiveBot(db);
  await db.insert(user).values({
    id: "admin",
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
  });
  await db.update(channel).set({ botEnabled: true }).where(eq(channel.id, tenant.route.channelId));
  const remote = { subscribed: true, fail: false, beforeUnsubscribe: async () => {} };
  const lifecycle = createTenantLifecycle({
    db,
    clock: tenant.clock,
    getWhatsApp: () => ({
      async unsubscribe() {
        await remote.beforeUnsubscribe();
        if (remote.fail) return { ok: false };
        remote.subscribed = false;
        return { ok: true };
      },
      async subscribe() {
        if (remote.fail) return { ok: false as const, error: "subscription_failed" as const };
        remote.subscribed = true;
        return { ok: true as const };
      },
    }),
  });
  return { tenant, other, lifecycle, remote };
};

test("only an administrator cancels a Tenant, disconnecting only its Channel and access", async () => {
  const { tenant, other, lifecycle, remote } = await setup();
  expect(await lifecycle.cancel(tenant.scope.userId, tenant.scope.tenantId)).toEqual({
    ok: false,
    error: "forbidden",
  });
  expect(await resolveChannelPhoneNumber(db, tenant.phoneNumberId)).not.toBeNull();
  expect(await lifecycle.cancel("admin", tenant.scope.tenantId)).toMatchObject({
    ok: true,
    channelDisconnected: true,
  });
  expect(remote.subscribed).toBe(false);
  expect(await resolveChannelPhoneNumber(db, tenant.phoneNumberId)).toBeNull();
  expect(await resolveTenantScope(db, { userId: tenant.scope.userId })).toBeNull();
  expect(await resolveChannelPhoneNumber(db, other.phoneNumberId)).not.toBeNull();
  expect(await resolveTenantScope(db, { userId: other.scope.userId })).not.toBeNull();
});

test("cancellation stops every reply checkpoint even if a stale subscription completes", async () => {
  const { tenant, lifecycle } = await setup();
  const conversationId = (await recordInboundTextMessage(db, tenant.route, {
    wamid: "before-cancel",
    from: "5511999990001",
    profileName: "Ana",
    text: "Preço?",
    sentAt: tenant.clock.now(),
  }))!;
  const gate = createReplyGate({ db, clock: tenant.clock, allowance: createTestBotAllowance() });
  const turn = { scope: tenant.route, conversationId };
  expect(await gate.check(turn, "beforeModel")).toEqual({ kind: "reply" });
  await lifecycle.cancel("admin", tenant.scope.tenantId);
  await db
    .update(channel)
    .set({ subscriptionStatus: "subscribed" })
    .where(eq(channel.id, tenant.route.channelId));
  for (const checkpoint of ["enqueue", "beforeModel", "beforeSend"] as const)
    expect(await gate.check(turn, checkpoint)).toEqual({ kind: "skip" });
});

test("a webhook job holding an old Channel route cannot file data after cancellation", async () => {
  const { tenant, lifecycle } = await setup();
  await lifecycle.cancel("admin", tenant.scope.tenantId);
  expect(
    await recordInboundTextMessage(db, tenant.route, {
      wamid: "after-cancel",
      from: "5511999990001",
      profileName: "Ana",
      text: "Preço?",
      sentAt: tenant.clock.now(),
    }),
  ).toBeNull();
});

test("an in-flight Member request cannot obtain the canceled Channel's credential", async () => {
  const { tenant, lifecycle } = await setup();
  await lifecycle.cancel("admin", tenant.scope.tenantId);
  expect(await findChannelCredential(db, tenant.scope, tenant.route.channelId)).toBeNull();
});

test("pending invitations cannot create memberships in a canceled Tenant", async () => {
  const { tenant, lifecycle } = await setup();
  const onboarding = createTenantOnboarding({
    db,
    clock: tenant.clock,
    mailer: createTestMailer(),
    appUrl: "https://bots.example.com",
  });
  const created = await onboarding.createTenant("admin", {
    tenantName: "Pending Tenant",
    ownerEmail: "pending@example.com",
  });
  if (!created.ok) throw new Error("Setup failed");
  await lifecycle.cancel("admin", created.tenantId);
  expect(await onboarding.findInvitation(created.invitationId)).toBeNull();
  expect(
    await onboarding.acceptInvitation({
      invitationId: created.invitationId,
      acceptedTerms: true,
      name: "Owner",
      password: "password-123",
    }),
  ).toEqual({ ok: false, error: "unavailable" });
});

test("reactivation within 30 days restores the Channel and the same memberships", async () => {
  const { tenant, lifecycle, remote } = await setup();
  expect(await lifecycle.reactivate(tenant.scope.userId, tenant.scope.tenantId)).toEqual({
    ok: false,
    error: "forbidden",
  });
  await lifecycle.cancel("admin", tenant.scope.tenantId);
  tenant.clock.set(new Date("2026-11-21T11:59:59.999Z"));
  expect(await lifecycle.reactivate("admin", tenant.scope.tenantId)).toEqual({ ok: true });
  expect(remote.subscribed).toBe(true);
  expect(await resolveTenantScope(db, { userId: tenant.scope.userId })).toEqual(tenant.scope);
  expect(await resolveChannelPhoneNumber(db, tenant.phoneNumberId)).toEqual(tenant.route);
});

test("repeated cancellation preserves the deadline, and reactivation refuses at exactly 30 days", async () => {
  const { tenant, lifecycle } = await setup();
  const first = await lifecycle.cancel("admin", tenant.scope.tenantId);
  tenant.clock.advance(24 * 60 * 60 * 1000);
  expect(await lifecycle.cancel("admin", tenant.scope.tenantId)).toEqual(first);
  tenant.clock.set(new Date("2026-11-21T12:00:00Z"));
  expect(await lifecycle.reactivate("admin", tenant.scope.tenantId)).toEqual({
    ok: false,
    error: "recovery_expired",
  });
  expect(await resolveTenantScope(db, { userId: tenant.scope.userId })).toBeNull();
});

test("a failed Meta disconnection keeps local access blocked and can be retried", async () => {
  const { tenant, lifecycle, remote } = await setup();
  remote.fail = true;
  expect(await lifecycle.cancel("admin", tenant.scope.tenantId)).toMatchObject({
    ok: true,
    channelDisconnected: false,
  });
  expect(await resolveChannelPhoneNumber(db, tenant.phoneNumberId)).toBeNull();
  expect(await lifecycle.reactivate("admin", tenant.scope.tenantId)).toEqual({
    ok: false,
    error: "subscription_failed",
  });
  expect(await resolveTenantScope(db, { userId: tenant.scope.userId })).toBeNull();
  remote.fail = false;
  expect(await lifecycle.cancel("admin", tenant.scope.tenantId)).toMatchObject({
    ok: true,
    channelDisconnected: true,
  });
  expect(await lifecycle.reactivate("admin", tenant.scope.tenantId)).toEqual({ ok: true });
});

test("daily maintenance retries a failed Meta disconnection without extending the recovery window", async () => {
  const { tenant, lifecycle, remote } = await setup();
  remote.fail = true;
  const first = await lifecycle.cancel("admin", tenant.scope.tenantId);
  tenant.clock.advance(24 * 60 * 60 * 1000);
  await expect(lifecycle.retryDisconnections()).rejects.toThrow("Tenant disconnection failed");
  remote.fail = false;
  await lifecycle.retryDisconnections();
  expect(remote.subscribed).toBe(false);
  expect(await lifecycle.cancel("admin", tenant.scope.tenantId)).toMatchObject(
    first.ok ? { canceledAt: first.canceledAt } : {},
  );
});

test("reactivation cannot overtake an in-flight disconnection", async () => {
  const { tenant, lifecycle, remote } = await setup();
  remote.beforeUnsubscribe = async () => {
    expect(await lifecycle.reactivate("admin", tenant.scope.tenantId)).toEqual({
      ok: false,
      error: "busy",
    });
    expect(await resolveChannelPhoneNumber(db, tenant.phoneNumberId)).toBeNull();
  };
  expect(await lifecycle.cancel("admin", tenant.scope.tenantId)).toMatchObject({
    ok: true,
    channelDisconnected: true,
  });
});

test.each([true, false])(
  "cancellation during a Member subscription durably disconnects its late completion (immediate compensation: %s)",
  async (compensated) => {
    const { tenant, lifecycle, remote } = await setup();
    let cancellation: Awaited<ReturnType<typeof lifecycle.cancel>> | undefined;
    const service = createChannelService({
      db,
      clock: tenant.clock,
      getWhatsApp: () => ({
        exchangeSignup: async () => {
          throw new Error("Unused signup");
        },
        requestAppSync: async () => ({ ok: true }),
        async subscribe() {
          cancellation = await lifecycle.cancel("admin", tenant.scope.tenantId);
          expect(await resolveChannelPhoneNumber(db, tenant.phoneNumberId)).toBeNull();
          remote.subscribed = true;
          return { ok: true as const };
        },
        async unsubscribe() {
          remote.subscribed = !compensated;
          return { ok: compensated };
        },
      }),
    });
    await service.retrySubscription(tenant.scope);
    expect(cancellation).toMatchObject({ ok: true });
    expect(remote.subscribed).toBe(!compensated);
    await lifecycle.retryDisconnections();
    expect(remote.subscribed).toBe(false);
  },
);

test("the daily task deletes expired Tenant data and exclusive identities, preserving shared Members", async () => {
  const { tenant, other, lifecycle } = await setup();
  const target = tenant.scope.tenantId;
  await db.insert(member).values([
    { organizationId: target, userId: other.scope.userId },
    { organizationId: target, userId: "admin" },
  ]);
  await db.insert(account).values({
    userId: tenant.scope.userId,
    accountId: "owner",
    providerId: "credential",
    password: "hash",
  });
  await db.insert(session).values([
    { userId: tenant.scope.userId, token: "exclusive-session", expiresAt: new Date("2027-01-01") },
    {
      userId: other.scope.userId,
      token: "shared-session",
      activeOrganizationId: target,
      expiresAt: new Date("2027-01-01"),
    },
  ]);
  await db.insert(verification).values({
    identifier: "reset-password:token",
    value: tenant.scope.userId,
    expiresAt: new Date("2027-01-01"),
  });
  await recordInboundTextMessage(db, tenant.route, {
    wamid: "delete-me",
    from: "5511999990001",
    profileName: "Ana",
    text: "Dados pessoais",
    sentAt: tenant.clock.now(),
  });
  await db.insert(inboxEvent).values([
    {
      id: "target-event",
      dedupeKey: "target",
      field: "messages",
      phoneNumberId: tenant.phoneNumberId,
      payload: { private: "data" },
      receivedAt: tenant.clock.now(),
    },
    {
      id: "other-event",
      dedupeKey: "other",
      field: "messages",
      phoneNumberId: other.phoneNumberId,
      payload: {},
      receivedAt: tenant.clock.now(),
    },
  ]);
  await lifecycle.cancel("admin", target);
  tenant.clock.set(new Date("2026-11-21T11:59:59.999Z"));
  await pruneCanceledTenants(db, tenant.clock);
  expect(await db.$count(organization, eq(organization.id, target))).toBe(1);
  tenant.clock.advance(1);
  const route = createDailyCronRoute({
    secret: "cron-secret",
    tasks: [{ name: "delete-canceled-tenants", run: () => pruneCanceledTenants(db, tenant.clock) }],
  });
  expect(
    (
      await route.GET(
        new Request("https://bots.example.com/api/cron/daily", {
          headers: { authorization: "Bearer cron-secret" },
        }),
      )
    ).status,
  ).toBe(200);
  expect(await db.$count(organization, eq(organization.id, target))).toBe(0);
  expect(await db.$count(channel, eq(channel.tenantId, target))).toBe(0);
  expect(await db.$count(contact, eq(contact.tenantId, target))).toBe(0);
  expect(await db.$count(inboxEvent, eq(inboxEvent.id, "target-event"))).toBe(0);
  expect(await db.$count(inboxEvent, eq(inboxEvent.id, "other-event"))).toBe(1);
  expect(await db.$count(account, eq(account.userId, tenant.scope.userId))).toBe(0);
  expect(await db.$count(session, eq(session.userId, tenant.scope.userId))).toBe(0);
  expect(await db.$count(verification, eq(verification.value, tenant.scope.userId))).toBe(0);
  expect(
    await createUserRepository(db).findByEmail(`${tenant.phoneNumberId}@example.com`),
  ).toBeNull();
  expect(await resolveTenantScope(db, { userId: other.scope.userId })).toEqual(other.scope);
  expect(await createUserRepository(db).findByEmail("admin@example.com")).not.toBeNull();
  const [sharedSession] = await db
    .select()
    .from(session)
    .where(eq(session.token, "shared-session"));
  expect(sharedSession.activeOrganizationId).toBeNull();
  await pruneCanceledTenants(db, tenant.clock);
  expect(await resolveChannelPhoneNumber(db, other.phoneNumberId)).toEqual(other.route);
});
