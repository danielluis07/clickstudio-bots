import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import { createChannelService } from "@/modules/channels";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createWhatsAppAdapter, whatsAppWebhookFields } from "@/platform/whatsapp";
import { createTestClock } from "@/test/support/clock";
import { createTestDatabase } from "@/test/support/database";

let db: Database;
let owner: TenantScope;
let attendant: TenantScope;
let otherOwner: TenantScope;
const clock = createTestClock(new Date("2026-10-20T12:00:00Z"));

const harness = (phoneNumberId = "300") => {
  const requests: string[] = [];
  let failSubscription = false;
  const adapter = createWhatsAppAdapter({
    appId: "100", appSecret: "app-secret", graphVersion: "v26.0",
    activeKeyVersion: "v1", encryptionKeys: { v1: Buffer.alloc(32, 7).toString("base64") },
    async fetch(url) {
      requests.push(String(url));
      if (String(url).endsWith("oauth/access_token")) return Response.json({ access_token: "secret-token" });
      if (String(url).includes("phone_numbers")) return Response.json({ data: [{ id: phoneNumberId, display_phone_number: "+55 11 99999-0000", is_on_biz_app: true, platform_type: "CLOUD_API" }] });
      if (String(url).endsWith("/subscriptions")) return Response.json({ data: [{ object: "whatsapp_business_account", active: true, fields: whatsAppWebhookFields.map((name) => ({ name })) }] });
      return Response.json({ success: !failSubscription });
    },
  });
  return {
    service: createChannelService({ db, clock, getWhatsApp: () => adapter }),
    requests,
    setFailure(value: boolean) { failSubscription = value; },
  };
};

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

beforeEach(async () => { await db.delete(channel); });

describe("Channels", () => {
  test("only the owner connects a Channel, with its Bot off and a safe summary", async () => {
    const { service, requests } = harness();
    const input = { code: "signup-code", wabaId: "200" };
    expect(await service.connect(attendant, input)).toEqual({ ok: false, error: "forbidden" });
    expect(requests).toHaveLength(0);
    expect(await service.connect(owner, input)).toMatchObject({ ok: true });
    const connected = await service.getChannel(owner);
    expect(connected).toMatchObject({ phoneNumberId: "300", botEnabled: false, subscriptionStatus: "subscribed", subscriptionAttemptedAt: clock.now() });
    expect(JSON.stringify(connected)).not.toMatch(/secret-token|ciphertext|credential|keyVersion/);
    expect(await service.getChannel(attendant)).toEqual(connected);
    expect(await service.getChannel(otherOwner)).toBeNull();
    expect(await service.resolvePhoneNumber("300")).toMatchObject({ channelId: connected!.id, tenantId: "tenant-a" });
    expect(await service.resolvePhoneNumber("unknown")).toBeNull();
  });

  test("rejects duplicate or concurrent connections and prevents two Tenants claiming the same phone", async () => {
    const { service } = harness();
    const input = { code: "signup-code", wabaId: "200" };
    const second = harness("301").service;
    const results = await Promise.all([service.connect(owner, input), second.connect(owner, { ...input, wabaId: "201" })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await service.connect(owner, input)).toEqual({ ok: false, error: "already_connected" });
    const connected = await service.getChannel(owner);
    const conflicting = harness(connected!.phoneNumberId).service;
    expect(await conflicting.connect(otherOwner, { ...input, wabaId: "202" })).toEqual({ ok: false, error: "channel_conflict" });
    expect(await service.getChannel(otherOwner)).toBeNull();
    expect(await service.resolvePhoneNumber(connected!.phoneNumberId)).toMatchObject({ tenantId: owner.tenantId });
  });

  test("records a subscription failure, retains the Channel and permits an owner to retry", async () => {
    const { service, setFailure } = harness();
    setFailure(true);
    expect(await service.connect(owner, { code: "signup-code", wabaId: "200" })).toEqual({ ok: true });
    expect(await service.getChannel(owner)).toMatchObject({
      botEnabled: false, subscriptionStatus: "failed", subscriptionError: "subscription_failed",
      subscriptionFields: ["messages", "account_update", "smb_message_echoes", "history", "smb_app_state_sync"],
      subscriptionAttemptedAt: clock.now(),
    });
    expect(await service.retrySubscription(attendant)).toEqual({ ok: false, error: "forbidden" });
    expect(await service.retrySubscription(otherOwner)).toEqual({ ok: false, error: "not_found" });
    setFailure(false);
    expect(await service.retrySubscription(owner)).toEqual({ ok: true });
    expect(await service.getChannel(owner)).toMatchObject({ botEnabled: false, subscriptionStatus: "subscribed", subscriptionError: null });
  });

  test("invalid signup inputs and unavailable Meta never create a Channel or reveal errors", async () => {
    const { service, requests } = harness();
    expect(await service.connect(owner, { code: "", wabaId: "../../other" })).toEqual({ ok: false, error: "invalid" });
    expect(requests).toHaveLength(0);
    const unavailable = createChannelService({ db, clock, getWhatsApp() { throw new Error("secret-token"); } });
    expect(await unavailable.connect(owner, { code: "signup-code", wabaId: "200" })).toEqual({ ok: false, error: "signup_failed" });
    expect(await service.getChannel(owner)).toBeNull();
  });
});
