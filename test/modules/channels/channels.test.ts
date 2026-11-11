import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import {
  channelSignal,
  createChannelService,
  recordAccountUpdate,
  recordCredentialRejected,
  sweepChannelHealth,
} from "@/modules/channels";
import { createTestDiagnostics } from "@/test/support/diagnostics";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createWhatsAppAdapter, whatsAppWebhookFields } from "@/platform/whatsapp";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
let owner: TenantScope;
let attendant: TenantScope;
let otherOwner: TenantScope;
const clock = createTestClock(new Date("2026-10-20T12:00:00Z"));

const harness = (phoneNumberId = "300") => {
  const requests: string[] = [];
  const syncRequests: unknown[] = [];
  let failSubscription = false;
  let failSync = false;
  const adapter = createWhatsAppAdapter({
    appId: "100",
    appSecret: "app-secret",
    graphVersion: "v26.0",
    activeKeyVersion: "v1",
    encryptionKeys: { v1: Buffer.alloc(32, 7).toString("base64") },
    async fetch(url, init) {
      requests.push(String(url));
      if (String(url).endsWith("oauth/access_token"))
        return Response.json({ access_token: "secret-token" });
      if (String(url).endsWith("/smb_app_data")) {
        syncRequests.push({
          url: String(url),
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return failSync
          ? new Response(null, { status: 400 })
          : Response.json({ messaging_product: "whatsapp", request_id: "request-1" });
      }
      if (String(url).includes("phone_numbers"))
        return Response.json({
          data: [
            {
              id: phoneNumberId,
              display_phone_number: "+55 11 99999-0000",
              is_on_biz_app: true,
              platform_type: "CLOUD_API",
            },
          ],
        });
      if (String(url).endsWith("/subscriptions"))
        return Response.json({
          data: [
            {
              object: "whatsapp_business_account",
              active: true,
              fields: whatsAppWebhookFields.map((name) => ({ name })),
            },
          ],
        });
      return Response.json({ success: !failSubscription });
    },
  });
  return {
    service: createChannelService({ db, clock, getWhatsApp: () => adapter }),
    requests,
    syncRequests,
    setFailure(value: boolean) {
      failSubscription = value;
    },
    setSyncFailure(value: boolean) {
      failSync = value;
    },
  };
};

afterAll(() => closeTestDatabase(db));

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner", name: "Owner", email: "owner@example.com" },
    { id: "attendant", name: "Attendant", email: "attendant@example.com" },
    { id: "other", name: "Other owner", email: "other@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner", role: "owner" },
    { organizationId: "tenant-a", userId: "attendant", role: "member" },
    { organizationId: "tenant-b", userId: "other", role: "owner" },
  ]);
  const resolve = async (userId: string) => {
    const scope = await resolveTenantScope(db, { userId });
    if (!scope) throw new Error("Expected Tenant scope");
    return scope;
  };
  owner = await resolve("owner");
  attendant = await resolve("attendant");
  otherOwner = await resolve("other");
});

beforeEach(async () => {
  await db.delete(channel);
  clock.set(new Date("2026-10-20T12:00:00Z"));
});

const syncRequest = (syncType: string) => ({
  url: "https://graph.facebook.com/v26.0/300/smb_app_data",
  headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
  body: { messaging_product: "whatsapp", sync_type: syncType },
});

describe("Channels", () => {
  test("only the owner connects a Channel, with its Bot off and a safe summary", async () => {
    const { service, requests } = harness();
    const input = { code: "signup-code", wabaId: "200" };
    expect(await service.connect(attendant, input)).toEqual({ ok: false, error: "forbidden" });
    expect(requests).toHaveLength(0);
    expect(await service.connect(owner, input)).toMatchObject({ ok: true });
    const connected = await service.getChannel(owner);
    expect(connected).toMatchObject({
      phoneNumberId: "300",
      botEnabled: false,
      subscriptionStatus: "subscribed",
      subscriptionAttemptedAt: clock.now(),
    });
    expect(JSON.stringify(connected)).not.toMatch(/secret-token|ciphertext|credential|keyVersion/);
    expect(await service.getChannel(attendant)).toEqual(connected);
    expect(await service.getChannel(otherOwner)).toBeNull();
    expect(await service.resolvePhoneNumber("300")).toMatchObject({
      channelId: connected!.id,
      tenantId: "tenant-a",
    });
    expect(await service.resolvePhoneNumber("unknown")).toBeNull();
  });

  test("rejects duplicate or concurrent connections and prevents two Tenants claiming the same phone", async () => {
    const { service } = harness();
    const input = { code: "signup-code", wabaId: "200" };
    const second = harness("301").service;
    const results = await Promise.all([
      service.connect(owner, input),
      second.connect(owner, { ...input, wabaId: "201" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await service.connect(owner, input)).toEqual({ ok: false, error: "already_connected" });
    const connected = await service.getChannel(owner);
    const conflicting = harness(connected!.phoneNumberId).service;
    expect(await conflicting.connect(otherOwner, { ...input, wabaId: "202" })).toEqual({
      ok: false,
      error: "channel_conflict",
    });
    expect(await service.getChannel(otherOwner)).toBeNull();
    expect(await service.resolvePhoneNumber(connected!.phoneNumberId)).toMatchObject({
      tenantId: owner.tenantId,
    });
  });

  test("records a subscription failure, retains the Channel and permits an owner to retry", async () => {
    const { service, setFailure } = harness();
    setFailure(true);
    expect(await service.connect(owner, { code: "signup-code", wabaId: "200" })).toEqual({
      ok: true,
      reconnected: false,
    });
    expect(await service.getChannel(owner)).toMatchObject({
      botEnabled: false,
      subscriptionStatus: "failed",
      subscriptionError: "subscription_failed",
      subscriptionFields: [
        "messages",
        "account_update",
        "smb_message_echoes",
        "history",
        "smb_app_state_sync",
      ],
      subscriptionAttemptedAt: clock.now(),
    });
    expect(await service.retrySubscription(attendant)).toEqual({ ok: false, error: "forbidden" });
    expect(await service.retrySubscription(otherOwner)).toEqual({ ok: false, error: "not_found" });
    setFailure(false);
    expect(await service.retrySubscription(owner)).toEqual({ ok: true });
    expect(await service.getChannel(owner)).toMatchObject({
      botEnabled: false,
      subscriptionStatus: "subscribed",
      subscriptionError: null,
    });
  });

  test("invalid signup inputs and unavailable Meta never create a Channel or reveal errors", async () => {
    const { service, requests } = harness();
    expect(await service.connect(owner, { code: "", wabaId: "../../other" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(requests).toHaveLength(0);
    const unavailable = createChannelService({
      db,
      clock,
      getWhatsApp() {
        throw new Error("secret-token");
      },
    });
    expect(await unavailable.connect(owner, { code: "signup-code", wabaId: "200" })).toEqual({
      ok: false,
      error: "signup_failed",
    });
    expect(await service.getChannel(owner)).toBeNull();
  });

  test("requests contacts sync then history once, as soon as the subscription is confirmed", async () => {
    const { service, syncRequests } = harness();
    expect(await service.connect(owner, { code: "signup-code", wabaId: "200" })).toEqual({
      ok: true,
      reconnected: false,
    });
    expect(syncRequests).toEqual([syncRequest("smb_app_state_sync"), syncRequest("history")]);
    expect(await service.getChannel(owner)).toMatchObject({ historyNotImported: false });

    expect(await service.retrySubscription(owner)).toEqual({ ok: true });
    expect(syncRequests).toHaveLength(2);
  });

  test("a subscription confirmed on retry within 24 hours of onboarding still requests history", async () => {
    const { service, syncRequests, setFailure } = harness();
    setFailure(true);
    await service.connect(owner, { code: "signup-code", wabaId: "200" });
    expect(syncRequests).toEqual([]);
    expect(await service.getChannel(owner)).toMatchObject({ historyNotImported: false });

    setFailure(false);
    clock.advance(23 * 60 * 60 * 1000);
    await service.retrySubscription(owner);
    expect(syncRequests).toEqual([syncRequest("smb_app_state_sync"), syncRequest("history")]);
  });

  test("history is not imported once 24 hours pass without a confirmed subscription", async () => {
    const { service, syncRequests, setFailure } = harness();
    setFailure(true);
    await service.connect(owner, { code: "signup-code", wabaId: "200" });

    clock.advance(24 * 60 * 60 * 1000);
    expect(await service.getChannel(owner)).toMatchObject({ historyNotImported: true });
    setFailure(false);
    await service.retrySubscription(owner);
    expect(syncRequests).toEqual([]);
    expect(await service.getChannel(owner)).toMatchObject({
      subscriptionStatus: "subscribed",
      historyNotImported: true,
    });
  });

  test("a history request Meta refuses is not repeated and shows history not imported", async () => {
    const { service, syncRequests, setSyncFailure } = harness();
    setSyncFailure(true);
    await service.connect(owner, { code: "signup-code", wabaId: "200" });
    expect(syncRequests).toHaveLength(2);
    expect(await service.getChannel(owner)).toMatchObject({
      subscriptionStatus: "subscribed",
      historyNotImported: true,
    });

    setSyncFailure(false);
    await service.retrySubscription(owner);
    expect(syncRequests).toHaveLength(2);
  });

  test("concurrent retries request history only once", async () => {
    const { service, syncRequests, setFailure } = harness();
    setFailure(true);
    await service.connect(owner, { code: "signup-code", wabaId: "200" });
    setFailure(false);
    await Promise.all([service.retrySubscription(owner), service.retrySubscription(owner)]);
    expect(syncRequests).toEqual([syncRequest("smb_app_state_sync"), syncRequest("history")]);
  });
});

describe("Channel signal", () => {
  test("is healthy only for a healthy Channel whose events are confirmed", () => {
    expect(channelSignal({ health: "healthy", subscriptionStatus: "subscribed" })).toBe("healthy");
  });

  test("warns while the Channel waits on Meta", () => {
    for (const subscriptionStatus of ["pending", "failed", "disconnected"])
      expect(channelSignal({ health: "healthy", subscriptionStatus })).toBe("warning");
    expect(channelSignal({ health: "restricted", subscriptionStatus: "subscribed" })).toBe(
      "warning",
    );
  });

  test("fails while the account keeps the Bot from replying", () => {
    for (const health of ["credential_rejected", "removed", "banned"] as const)
      expect(channelSignal({ health, subscriptionStatus: "subscribed" })).toBe("failing");
  });
});

describe("Channel health", () => {
  const connect = async () => {
    const fixture = harness();
    await fixture.service.connect(owner, { code: "signup-code", wabaId: "200" });
    const connected = (await fixture.service.getChannel(owner))!;
    return { ...fixture, connected };
  };

  test("a connected Channel is healthy and cannot be connected again", async () => {
    const { service, connected } = await connect();
    expect(connected).toMatchObject({ health: "healthy", canReconnect: false });
    expect(await service.connect(owner, { code: "again", wabaId: "200" })).toEqual({
      ok: false,
      error: "already_connected",
    });
  });

  test("the owner reconnects the same number after Meta rejects its credential", async () => {
    const { service, connected, requests } = await connect();
    await recordCredentialRejected(db, owner, connected.id, clock.now());
    expect(await service.getChannel(attendant)).toMatchObject({
      health: "credential_rejected",
      canReconnect: true,
    });
    const [{ credential: rejected }] = await db.select().from(channel);
    expect(await service.connect(attendant, { code: "again", wabaId: "200" })).toEqual({
      ok: false,
      error: "forbidden",
    });

    requests.length = 0;
    clock.advance(60_000);
    expect(await service.connect(owner, { code: "again", wabaId: "200" })).toEqual({
      ok: true,
      reconnected: true,
    });
    const [stored] = await db.select().from(channel);
    expect(stored).toMatchObject({
      id: connected.id,
      health: "healthy",
      healthChangedAt: clock.now(),
      subscriptionStatus: "subscribed",
    });
    expect(stored.credential).not.toEqual(rejected);
    // Subscribed again, as Meta drops the app when the partner is removed.
    expect(requests.some((url) => url.endsWith("/200/subscribed_apps"))).toBe(true);
  });

  test("reconnecting refuses another number and keeps the Channel waiting", async () => {
    const { connected } = await connect();
    await recordCredentialRejected(db, owner, connected.id, clock.now());
    const other = harness("301").service;
    expect(await other.connect(owner, { code: "again", wabaId: "200" })).toEqual({
      ok: false,
      error: "different_number",
    });
    expect(await other.connect(owner, { code: "again", wabaId: "201" })).toEqual({
      ok: false,
      error: "different_number",
    });
    expect(await other.getChannel(owner)).toMatchObject({
      phoneNumberId: "300",
      health: "credential_rejected",
    });
  });

  test("a ban or restriction cannot be cleared by reconnecting", async () => {
    const { service, connected } = await connect();
    const route = (await service.resolvePhoneNumber("300"))!;
    await recordAccountUpdate(db, route, { kind: "banned" }, clock.now());
    // A rejected credential never hides the ban.
    await recordCredentialRejected(db, owner, connected.id, clock.now());
    expect(await service.getChannel(owner)).toMatchObject({
      health: "banned",
      canReconnect: false,
    });
    expect(await service.connect(owner, { code: "again", wabaId: "200" })).toEqual({
      ok: false,
      error: "already_connected",
    });
    await recordAccountUpdate(db, route, { kind: "reinstated" }, clock.now());
    expect(await service.getChannel(owner)).toMatchObject({ health: "healthy" });
  });

  test("the sweep alerts once per unhealthy state and lifts restrictions that ended", async () => {
    const { service } = await connect();
    const route = (await service.resolvePhoneNumber("300"))!;
    const diagnostics = createTestDiagnostics();
    const until = new Date(clock.now().getTime() + 60 * 60_000);
    await recordAccountUpdate(db, route, { kind: "restricted", until }, clock.now());
    expect(await service.getChannel(owner)).toMatchObject({
      health: "restricted",
      restrictedUntil: until,
    });

    await sweepChannelHealth({ db, clock, diagnostics });
    await sweepChannelHealth({ db, clock, diagnostics });
    expect(diagnostics.alerts).toEqual([{ kind: "channel_unhealthy", operation: "restricted" }]);

    // A later end for the same restriction is not a new alert.
    const later = new Date(until.getTime() + 60 * 60_000);
    await recordAccountUpdate(db, route, { kind: "restricted", until: later }, clock.now());
    clock.set(until);
    await sweepChannelHealth({ db, clock, diagnostics });
    expect(await service.getChannel(owner)).toMatchObject({ health: "restricted" });
    expect(diagnostics.alerts).toHaveLength(1);

    clock.set(later);
    await sweepChannelHealth({ db, clock, diagnostics });
    expect(await service.getChannel(owner)).toMatchObject({
      health: "healthy",
      restrictedUntil: null,
    });

    await recordAccountUpdate(db, route, { kind: "removed" }, clock.now());
    await sweepChannelHealth({ db, clock, diagnostics });
    expect(diagnostics.alerts).toEqual([
      { kind: "channel_unhealthy", operation: "restricted" },
      { kind: "channel_unhealthy", operation: "removed" },
    ]);
  });
});
