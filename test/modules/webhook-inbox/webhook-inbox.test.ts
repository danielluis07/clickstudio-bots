import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, contact, conversation, inboxEvent, member, message, organization, user } from "@/db/schema";
import { createConversationRepository } from "@/modules/conversations";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { createTestClock } from "@/test/support/clock";
import { createTestDatabase } from "@/test/support/database";
import { createTestJobQueue, type TestJobQueue } from "@/test/support/job-queue";
import { metaAppSecret, metaDelivery, referencingChange, signMetaDelivery, statusChange, textMessageChange } from "@/test/support/meta-webhook";

let db: Database;
let tenantA: TenantScope;
let tenantB: TenantScope;
let queue: TestJobQueue;
let inbox: ReturnType<typeof createWebhookInbox>;
const clock = createTestClock(new Date("2026-10-20T12:00:00Z"));

const receive = (body: string) => inbox.receive({ body, signature: signMetaDelivery(body) });

// Delivers every enqueued job, as QStash would.
const runJobs = async () => {
  for (const job of queue.take()) await inbox.process(job.inboxEventId);
};

const conversationsOf = async (scope: TenantScope) => {
  const repository = createConversationRepository(db, scope);
  return Promise.all((await repository.listConversations()).map(async (found) => ({
    ...found,
    messages: await repository.listMessages(found.id),
  })));
};

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner-a", name: "Owner A", email: "a@example.com" },
    { id: "owner-b", name: "Owner B", email: "b@example.com" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Tenant A", slug: "a" },
    { id: "tenant-b", name: "Tenant B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-b", userId: "owner-b", role: "owner" },
  ]);
  const credential = { keyVersion: "v1", iv: "", ciphertext: "", tag: "" };
  await db.insert(channel).values([
    { id: "channel-a", tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300", displayPhoneNumber: "+55 11 99999-0000", credential, subscriptionFields: [] },
    { id: "channel-b", tenantId: "tenant-b", wabaId: "201", phoneNumberId: "301", displayPhoneNumber: "+55 11 99999-0001", credential, subscriptionFields: [] },
  ]);
  tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  tenantB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
});

beforeEach(async () => {
  await db.delete(message);
  await db.delete(conversation);
  await db.delete(contact);
  await db.delete(inboxEvent);
  queue = createTestJobQueue();
  inbox = createWebhookInbox({ db, clock, queue, appSecret: metaAppSecret });
});

describe("Webhook inbox", () => {
  test("a signed text message becomes one Contact, one Conversation and one message", async () => {
    const delivery = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1", body: "Olá!" }));

    expect(await receive(delivery)).toEqual({ ok: true });
    await runJobs();

    expect(await conversationsOf(tenantA)).toEqual([{
      id: expect.any(String),
      channelId: "channel-a",
      contactPhone: "5511988887777",
      contactProfileName: "Maria Teste",
      messages: [{ wamid: "wamid.A1", direction: "inbound", type: "text", text: "Olá!", sentAt: new Date("2026-10-20T12:00:00Z") }],
    }]);
    expect(await conversationsOf(tenantB)).toEqual([]);
  });

  test("replaying a delivery, or an event inside another batch, creates no duplicates", async () => {
    const first = textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" });
    await receive(metaDelivery(first));
    await runJobs();
    const stored = await conversationsOf(tenantA);

    expect(await receive(metaDelivery(first))).toEqual({ ok: true });
    expect(queue.take()).toEqual([]);

    // Meta may batch the same message with new events about it. Each status
    // refers to the same wamid, yet each is a distinct event to process.
    const rebatched = metaDelivery(
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.A2", body: "Segunda mensagem" }),
      first,
      statusChange({ phoneNumberId: "300", wamid: "wamid.OUT1", status: "delivered" }),
      statusChange({ phoneNumberId: "300", wamid: "wamid.OUT1", status: "read", timestamp: "1792497800" }),
    );
    expect(await receive(rebatched)).toEqual({ ok: true });
    expect(queue.jobs).toHaveLength(3);
    await runJobs();
    await receive(rebatched);
    await runJobs();

    const [conversationAfter] = await conversationsOf(tenantA);
    expect(conversationAfter.id).toBe(stored[0].id);
    expect(conversationAfter.messages.map(({ wamid }) => wamid)).toEqual(["wamid.A1", "wamid.A2"]);
  });

  test("rejects invalid signatures without storing or enqueueing anything", async () => {
    const delivery = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" }));
    const tampered = delivery.replace("Olá", "Oi");

    for (const signature of [null, "", "sha256=", signMetaDelivery(delivery, "another-secret"), signMetaDelivery(delivery), `sha1=${signMetaDelivery(tampered).slice(7)}`]) {
      expect(await inbox.receive({ body: tampered, signature })).toEqual({ ok: false, error: "invalid_signature" });
    }

    expect(queue.jobs).toEqual([]);
    // Storage is the criterion itself, so this one check reads the table.
    expect(await db.$count(inboxEvent)).toBe(0);
  });

  test("an event stored before a failed enqueue stays unprocessed and is recovered by redelivery", async () => {
    const delivery = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" }));
    queue.failing = true;

    expect(await receive(delivery)).toEqual({ ok: false, error: "enqueue_failed" });
    expect(await conversationsOf(tenantA)).toEqual([]);

    // Meta retries a delivery that was not acknowledged.
    queue.failing = false;
    expect(await receive(delivery)).toEqual({ ok: true });
    expect(queue.jobs).toHaveLength(1);
    await runJobs();
    expect((await conversationsOf(tenantA))[0].messages).toHaveLength(1);
  });

  test("an event for an unknown phone-number-id creates data in no Tenant", async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "999", wamid: "wamid.X1" })));
    const [job] = queue.take();

    expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "ignored" });
    expect(await conversationsOf(tenantA)).toEqual([]);
    expect(await conversationsOf(tenantB)).toEqual([]);
    expect(await inbox.process("missing")).toEqual({ ok: false, error: "not_found" });
  });

  test("files each event under the Tenant of the Channel it addressed", async () => {
    await receive(metaDelivery(
      textMessageChange({ phoneNumberId: "301", wamid: "wamid.B1", body: "Para B" }),
      textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1", body: "Para A" }),
    ));
    await runJobs();

    expect((await conversationsOf(tenantA)).flatMap(({ messages }) => messages.map(({ text }) => text))).toEqual(["Para A"]);
    expect(await conversationsOf(tenantB)).toMatchObject([{ channelId: "channel-b", messages: [{ text: "Para B" }] }]);
  });

  test("edits and revokes reusing a message's wamid stay distinct, processable events", async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" })));
    await runJobs();

    const edit = referencingChange({ phoneNumberId: "300", wamid: "wamid.A1", type: "edit" });
    const revoke = referencingChange({ phoneNumberId: "300", wamid: "wamid.A1", type: "revoke" });
    await receive(metaDelivery(edit, revoke));
    expect(queue.jobs).toHaveLength(2);
    // Showing edits and revokes is #46; until then they change nothing.
    await runJobs();
    await receive(metaDelivery(edit));
    expect(queue.take()).toEqual([]);

    expect((await conversationsOf(tenantA))[0].messages).toMatchObject([{ wamid: "wamid.A1", text: "Olá, vocês abrem sábado?" }]);
  });

  test("duplicate jobs for one event, even concurrent ones, store its message once", async () => {
    await receive(metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.A1" })));
    const [job] = queue.take();

    await Promise.all([inbox.process(job.inboxEventId), inbox.process(job.inboxEventId)]);
    await inbox.process(job.inboxEventId);

    const conversations = await conversationsOf(tenantA);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].messages).toHaveLength(1);
  });
});
