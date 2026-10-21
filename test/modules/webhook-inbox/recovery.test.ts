import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, contact, conversation, inboxEvent, member, message, organization, user } from "@/db/schema";
import { createConversationRepository } from "@/modules/conversations";
import { resolveTenantScope } from "@/modules/tenancy";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import type { Diagnostic } from "@/platform/diagnostics";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { metaAppSecret, metaDelivery, signMetaDelivery, textMessageChange } from "@/test/support/meta-webhook";

let db: Database;
const clock = createTestClock(new Date("2026-10-21T12:00:00Z"));
let queue = createTestJobQueue();
let notifier = createTestNotifier();
let inbox: ReturnType<typeof createWebhookInbox>;

afterAll(() => closeTestDatabase(db));

beforeAll(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "admin", name: "Admin", email: "admin@example.com", role: "admin" },
    { id: "banned-admin", name: "Banned Admin", email: "banned@example.com", role: "admin", banned: true },
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
  await db.insert(channel).values({
    id: "channel-a", tenantId: "tenant-a", wabaId: "200", phoneNumberId: "300",
    displayPhoneNumber: "+55 11 99999-0000", subscriptionFields: [],
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
  });
});

beforeEach(async () => {
  await db.delete(message);
  await db.delete(conversation);
  await db.delete(contact);
  await db.delete(inboxEvent);
  queue = createTestJobQueue();
  notifier = createTestNotifier();
  inbox = createWebhookInbox({ db, clock, queue, notifier, appSecret: metaAppSecret });
});

test("only an administrator can inspect and replay a failed event, using its original Tenant route", async () => {
  const body = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.RECOVERY", body: "Conteúdo privado" }));
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  notifier.failNext();
  await expect(inbox.process(job.inboxEventId)).rejects.toThrow();

  for (const actor of ["owner-a", "owner-b", "missing", "banned-admin"]) {
    expect(await inbox.listFailures(actor)).toEqual({ ok: false, error: "forbidden" });
    expect(await inbox.replay(actor, job.inboxEventId)).toEqual({ ok: false, error: "forbidden" });
  }
  const failures = await inbox.listFailures("admin");
  expect(failures).toEqual({ ok: true, hasMore: false, events: [{
    id: job.inboxEventId, errorClass: "Error", status: "pending",
    receivedAt: clock.now(), failedAt: clock.now(),
  }] });
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "processed" });
  const pings = [...notifier.pings];
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "processed" });
  expect(notifier.pings).toEqual(pings);
  expect(await inbox.listFailures("admin")).toEqual({ ok: true, events: [], hasMore: false });

  const tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  const tenantB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
  const conversations = await createConversationRepository(db, tenantA).listConversations();
  expect(conversations.conversations).toHaveLength(1);
  expect((await createConversationRepository(db, tenantA).listMessages(conversations.conversations[0].id))!.messages).toHaveLength(1);
  expect((await createConversationRepository(db, tenantB).listConversations()).conversations).toEqual([]);
});

test("exhausted jobs alert once without content, and duplicate callbacks cannot reopen a replayed event", async () => {
  const alerts: Diagnostic[] = [];
  inbox = createWebhookInbox({
    db, clock, queue, notifier, appSecret: metaAppSecret,
    diagnostics: { log() {}, alert: async (entry) => { alerts.push(entry); } },
  });
  const body = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.DEAD", body: "Privado 5511988887777" }));
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  notifier.failNext();
  await expect(inbox.process(job.inboxEventId)).rejects.toThrow();
  await inbox.fail(job.inboxEventId, "msg_failed");
  await inbox.fail(job.inboxEventId, "msg_failed");
  expect(alerts).toEqual([{ kind: "inbox_dead_letter", errorClass: "Error", inboxEventId: job.inboxEventId, jobId: "msg_failed" }]);
  expect(await inbox.listFailures("admin")).toMatchObject({ ok: true, events: [{ status: "failed", errorClass: "Error" }] });
  expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "failed" });
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "processed" });
  const pings = [...notifier.pings];
  await inbox.replay("admin", job.inboxEventId);
  await inbox.fail(job.inboxEventId, "msg_failed");
  expect(alerts).toHaveLength(1);
  expect(notifier.pings).toEqual(pings);
  expect(await inbox.listFailures("admin")).toEqual({ ok: true, events: [], hasMore: false });
});

test("a failure callback can retry an interrupted alert without losing the failed event", async () => {
  let unavailable = true;
  const alerts: Diagnostic[] = [];
  inbox = createWebhookInbox({
    db, clock, queue, notifier, appSecret: metaAppSecret,
    diagnostics: { log() {}, alert: async (entry) => {
      if (unavailable) throw new Error("Diagnostics unavailable");
      alerts.push(entry);
    } },
  });
  const body = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.ALERT-RETRY" }));
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  await expect(inbox.fail(job.inboxEventId, "msg_retry")).rejects.toThrow("Diagnostics unavailable");
  unavailable = false;
  await inbox.fail(job.inboxEventId, "msg_retry");
  expect(alerts).toEqual([{ kind: "inbox_dead_letter", inboxEventId: job.inboxEventId, jobId: "msg_retry", errorClass: "JobDeliveryError" }]);
  await inbox.fail(job.inboxEventId, "msg_retry");
  expect(alerts).toHaveLength(1);
});
