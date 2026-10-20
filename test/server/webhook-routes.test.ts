import { beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import { createConversationRepository } from "@/modules/conversations";
import { resolveTenantScope } from "@/modules/tenancy";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { createQStashJobVerifier } from "@/platform/qstash";
import { createInboxJobRoute, createWhatsAppWebhookRoute } from "@/server/webhook-routes";
import { createTestClock } from "@/test/support/clock";
import { createTestDatabase } from "@/test/support/database";
import { createTestJobQueue, type TestJobQueue } from "@/test/support/job-queue";
import { metaAppSecret, metaDelivery, signMetaDelivery, textMessageChange } from "@/test/support/meta-webhook";
import { qstashSigningKeys, signQStashRequest } from "@/test/support/qstash";

const webhookUrl = "https://bots.example.com/api/webhooks/whatsapp";
const jobUrl = "https://bots.example.com/api/jobs/process-inbox-event";

let db: Database;
let queue: TestJobQueue;
let webhook: ReturnType<typeof createWhatsAppWebhookRoute>;
let jobs: ReturnType<typeof createInboxJobRoute>;

const handshake = (params: Record<string, string>) =>
  webhook.GET(new Request(`${webhookUrl}?${new URLSearchParams(params)}`));

const deliver = (body: string, signature: string | null = signMetaDelivery(body)) =>
  webhook.POST(new Request(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature === null ? {} : { "x-hub-signature-256": signature }) },
    body,
  }));

const runJob = (body: string, signature: string | null = signQStashRequest({ url: jobUrl, body })) =>
  jobs.POST(new Request(jobUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature === null ? {} : { "upstash-signature": signature }) },
    body,
  }));

const messagesOfTenantA = async () => {
  const repository = createConversationRepository(db, (await resolveTenantScope(db, { userId: "owner-a" }))!);
  const conversations = await repository.listConversations();
  return (await Promise.all(conversations.map(({ id }) => repository.listMessages(id)))).flat();
};

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values({ id: "owner-a", name: "Owner A", email: "a@example.com" });
  await db.insert(organization).values({ id: "tenant-a", name: "Tenant A", slug: "a" });
  await db.insert(member).values({ organizationId: "tenant-a", userId: "owner-a", role: "owner" });
  await db.insert(channel).values({
    id: "channel-a", tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300", displayPhoneNumber: "+55 11 99999-0000",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" }, subscriptionFields: [],
  });
  queue = createTestJobQueue();
  const inbox = createWebhookInbox({ db, clock: createTestClock(), queue, appSecret: metaAppSecret });
  webhook = createWhatsAppWebhookRoute({ inbox, verifyToken: "verify-me" });
  jobs = createInboxJobRoute({ inbox, verifier: createQStashJobVerifier(qstashSigningKeys), url: jobUrl });
});

describe("WhatsApp webhook route", () => {
  test("answers Meta's verification handshake only with the configured token", async () => {
    const accepted = await handshake({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "1158201444" });
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe("1158201444");

    const refused: Record<string, string>[] = [
      { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "1158201444" },
      { "hub.mode": "unsubscribe", "hub.verify_token": "verify-me", "hub.challenge": "1158201444" },
      { "hub.mode": "subscribe", "hub.challenge": "1158201444" },
    ];
    for (const params of refused) {
      expect((await handshake(params)).status).toBe(403);
    }
  });

  test("acknowledges a signed delivery only once it is stored and enqueued", async () => {
    const body = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.R1" }));

    expect((await deliver(body, null)).status).toBe(401);
    expect((await deliver(body, signMetaDelivery(body, "another-secret"))).status).toBe(401);
    expect(queue.jobs).toEqual([]);

    queue.failing = true;
    expect((await deliver(body)).status).toBe(500);
    queue.failing = false;
    expect((await deliver(body)).status).toBe(200);
    expect(queue.jobs).toEqual([{ type: "process-inbox-event", inboxEventId: expect.any(String) }]);

    expect((await deliver("not json")).status).toBe(400);
  });

  test("refuses deliveries while the webhook is not configured", async () => {
    const unconfigured = createWhatsAppWebhookRoute(null);
    const body = metaDelivery();
    expect((await unconfigured.POST(new Request(webhookUrl, { method: "POST", body, headers: { "x-hub-signature-256": signMetaDelivery(body) } }))).status).toBe(503);
    expect((await unconfigured.GET(new Request(`${webhookUrl}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`))).status).toBe(403);
  });
});

describe("Process inbox event job route", () => {
  test("rejects requests QStash did not sign for this endpoint, and processes those it did", async () => {
    queue.take();
    await deliver(metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.J1", body: "Via job" })));
    const [job] = queue.take();
    const body = JSON.stringify({ inboxEventId: job.inboxEventId });

    for (const signature of [
      null,
      "not-a-jwt",
      signQStashRequest({ url: jobUrl, body, key: "sig_unknown" }),
      signQStashRequest({ url: "https://bots.example.com/api/jobs/other", body }),
      signQStashRequest({ url: jobUrl, body: JSON.stringify({ inboxEventId: "other" }) }),
      signQStashRequest({ url: jobUrl, body, now: Date.now() - 3_600_000 }),
    ]) {
      expect((await runJob(body, signature)).status).toBe(401);
    }
    expect(await messagesOfTenantA()).not.toContainEqual(expect.objectContaining({ wamid: "wamid.J1" }));

    expect((await runJob(body)).status).toBe(200);
    // Rotated keys: QStash may sign with the next key.
    expect((await runJob(body, signQStashRequest({ url: jobUrl, body, key: qstashSigningKeys.nextSigningKey }))).status).toBe(200);
    expect((await messagesOfTenantA()).filter(({ wamid }) => wamid === "wamid.J1")).toHaveLength(1);
  });

  test("accepts only an id-only payload and acknowledges events that no longer exist", async () => {
    for (const body of ["{}", JSON.stringify({ inboxEventId: "x", text: "Olá" }), JSON.stringify({ inboxEventId: 1 }), "not json"]) {
      expect((await runJob(body)).status).toBe(400);
    }
    expect((await runJob(JSON.stringify({ inboxEventId: "pruned" }))).status).toBe(200);
  });
});
