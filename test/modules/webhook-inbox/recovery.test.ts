import { afterAll, beforeAll, beforeEach, expect, onTestFinished, test } from "bun:test";
import type { Database } from "@/db/database";
import {
  channel,
  contact,
  conversation,
  inboxEvent,
  member,
  message,
  organization,
  user,
} from "@/db/schema";
import { createConversationRepository } from "@/modules/conversations";
import { resolveTenantScope } from "@/modules/tenancy";
import { autoRetryDelaysMs, createWebhookInbox } from "@/modules/webhook-inbox";
import type { Diagnostic } from "@/platform/diagnostics";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import {
  metaAppSecret,
  metaDelivery,
  signMetaDelivery,
  textMessageChange,
} from "@/test/support/meta-webhook";

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
    {
      id: "banned-admin",
      name: "Banned Admin",
      email: "banned@example.com",
      role: "admin",
      banned: true,
    },
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
    id: "channel-a",
    tenantId: "tenant-a",
    wabaId: "200",
    phoneNumberId: "300",
    displayPhoneNumber: "+55 11 99999-0000",
    subscriptionFields: [],
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
  const body = metaDelivery(
    textMessageChange({ phoneNumberId: "300", wamid: "wamid.RECOVERY", body: "Conteúdo privado" }),
  );
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  notifier.failNext();
  await expect(inbox.process(job.inboxEventId)).rejects.toThrow();

  for (const actor of ["owner-a", "owner-b", "missing", "banned-admin"]) {
    expect(await inbox.listFailures(actor)).toEqual({ ok: false, error: "forbidden" });
    expect(await inbox.replay(actor, job.inboxEventId)).toEqual({ ok: false, error: "forbidden" });
  }
  const failures = await inbox.listFailures("admin");
  expect(failures).toEqual({
    ok: true,
    hasMore: false,
    events: [
      {
        id: job.inboxEventId,
        errorClass: "Error",
        status: "pending",
        receivedAt: clock.now(),
        failedAt: clock.now(),
        autoRetries: 0,
        nextAutoRetryAt: null,
      },
    ],
  });
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "processed" });
  const pings = [...notifier.pings];
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "processed" });
  expect(notifier.pings).toEqual(pings);
  expect(await inbox.listFailures("admin")).toEqual({ ok: true, events: [], hasMore: false });

  const tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  const tenantB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
  const conversations = await createConversationRepository(db, tenantA).listConversations();
  expect(conversations.conversations).toHaveLength(1);
  expect(
    (await createConversationRepository(db, tenantA).listMessages(
      conversations.conversations[0].id,
    ))!.messages,
  ).toHaveLength(1);
  expect(
    (await createConversationRepository(db, tenantB).listConversations()).conversations,
  ).toEqual([]);
});

const alertingInbox = (alerts: Diagnostic[]) =>
  createWebhookInbox({
    db,
    clock,
    queue,
    notifier,
    appSecret: metaAppSecret,
    diagnostics: {
      log() {},
      alert: async (entry) => {
        alerts.push(entry);
      },
    },
  });

const restoreClock = () => {
  const start = clock.now();
  onTestFinished(() => clock.set(start));
};

test("an event that failed during an outage is replayed automatically once its backoff passes", async () => {
  restoreClock();
  const alerts: Diagnostic[] = [];
  inbox = alertingInbox(alerts);
  const body = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.OUTAGE" }));
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  notifier.failNext();
  await expect(inbox.process(job.inboxEventId)).rejects.toThrow();
  // QStash's retries ran out during the outage.
  await inbox.fail(job.inboxEventId, "msg_outage");
  expect(alerts).toEqual([]);
  expect(await inbox.listFailures("admin")).toMatchObject({
    ok: true,
    events: [
      {
        status: "failed",
        autoRetries: 0,
        nextAutoRetryAt: new Date(clock.now().getTime() + autoRetryDelaysMs[0]),
      },
    ],
  });

  clock.advance(autoRetryDelaysMs[0] - 1);
  expect(await inbox.retryFailed()).toBe(0);
  clock.advance(1);
  expect(await inbox.retryFailed()).toBe(1);
  // A second sweep before the job runs does not count another replay.
  expect(await inbox.retryFailed()).toBe(0);
  const [replayed] = queue.take();
  expect(replayed).toEqual({ type: "process-inbox-event", inboxEventId: job.inboxEventId });
  // The stalled-event scan leaves the replay to QStash's own retries.
  expect(await inbox.requeueStalled()).toBe(0);
  expect(await inbox.process(replayed.inboxEventId)).toEqual({ ok: true, status: "processed" });

  const tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  expect(
    (await createConversationRepository(db, tenantA).listConversations()).conversations,
  ).toHaveLength(1);
  expect(await inbox.listFailures("admin")).toEqual({ ok: true, events: [], hasMore: false });
  expect(alerts).toEqual([]);
});

test("an event that keeps failing is replayed three times with backoff, then alerts once and stays listed", async () => {
  restoreClock();
  const alerts: Diagnostic[] = [];
  inbox = alertingInbox(alerts);
  const body = metaDelivery(
    textMessageChange({ phoneNumberId: "300", wamid: "wamid.DEAD", body: "Privado 5511988887777" }),
  );
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  for (const delay of autoRetryDelaysMs) {
    notifier.failNext();
    await expect(inbox.process(job.inboxEventId)).rejects.toThrow();
    await inbox.fail(job.inboxEventId, "msg_failed");
    expect(alerts).toEqual([]);
    clock.advance(delay - 1);
    expect(await inbox.retryFailed()).toBe(0);
    clock.advance(1);
    expect(await inbox.retryFailed()).toBe(1);
    expect(queue.take()).toEqual([{ type: "process-inbox-event", inboxEventId: job.inboxEventId }]);
  }
  notifier.failNext();
  await expect(inbox.process(job.inboxEventId)).rejects.toThrow();
  await inbox.fail(job.inboxEventId, "msg_failed");
  await inbox.fail(job.inboxEventId, "msg_failed");
  expect(alerts).toEqual([
    {
      kind: "inbox_dead_letter",
      errorClass: "Error",
      inboxEventId: job.inboxEventId,
      jobId: "msg_failed",
    },
  ]);
  clock.advance(30 * 24 * 60 * 60_000 - 1);
  expect(await inbox.retryFailed()).toBe(0);
  expect(await inbox.requeueStalled()).toBe(0);
  expect(await inbox.listFailures("admin")).toMatchObject({
    ok: true,
    events: [{ status: "failed", errorClass: "Error", autoRetries: 3, nextAutoRetryAt: null }],
  });

  // Duplicate callbacks cannot reopen an event the administrator replayed.
  expect(await inbox.process(job.inboxEventId)).toEqual({ ok: true, status: "failed" });
  expect(await inbox.replay("admin", job.inboxEventId)).toEqual({ ok: true, status: "processed" });
  const pings = [...notifier.pings];
  await inbox.replay("admin", job.inboxEventId);
  await inbox.fail(job.inboxEventId, "msg_failed");
  expect(alerts).toHaveLength(1);
  expect(notifier.pings).toEqual(pings);
  expect(await inbox.listFailures("admin")).toEqual({ ok: true, events: [], hasMore: false });
});

test("automatic replay leaves events alerted before it existed to the administrator", async () => {
  restoreClock();
  const old = new Date(clock.now().getTime() - 24 * 60 * 60_000);
  await db.insert(inboxEvent).values({
    id: "alerted",
    dedupeKey: "alerted",
    field: "messages",
    payload: {},
    status: "failed",
    errorClass: "Error",
    receivedAt: old,
    failedAt: old,
    alertedAt: old,
  });
  expect(await inbox.retryFailed()).toBe(0);
  expect(queue.take()).toEqual([]);
  expect(await inbox.listFailures("admin")).toMatchObject({
    ok: true,
    events: [{ id: "alerted", nextAutoRetryAt: null }],
  });
});

test("a queue failure leaves a replayed event pending for the stalled-event scan", async () => {
  restoreClock();
  const old = new Date(clock.now().getTime() - 60 * 60_000);
  await db.insert(inboxEvent).values({
    id: "retry",
    dedupeKey: "retry",
    field: "messages",
    payload: {},
    status: "failed",
    errorClass: "Error",
    receivedAt: old,
    failedAt: old,
  });
  queue.failing = true;
  await expect(inbox.retryFailed()).rejects.toThrow();
  queue.failing = false;
  expect(await inbox.retryFailed()).toBe(0);
  clock.advance(35 * 60_000 - 1);
  expect(await inbox.requeueStalled()).toBe(0);
  clock.advance(1);
  expect(await inbox.requeueStalled()).toBe(1);
  expect(queue.take()).toEqual([{ type: "process-inbox-event", inboxEventId: "retry" }]);
});

test("a failure callback can retry an interrupted alert without losing the failed event", async () => {
  let unavailable = true;
  const alerts: Diagnostic[] = [];
  inbox = createWebhookInbox({
    db,
    clock,
    queue,
    notifier,
    appSecret: metaAppSecret,
    diagnostics: {
      log() {},
      alert: async (entry) => {
        if (unavailable) throw new Error("Diagnostics unavailable");
        alerts.push(entry);
      },
    },
  });
  const body = metaDelivery(
    textMessageChange({ phoneNumberId: "300", wamid: "wamid.ALERT-RETRY" }),
  );
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  // Its automatic replays have run out.
  await db.update(inboxEvent).set({ autoRetries: autoRetryDelaysMs.length });
  await expect(inbox.fail(job.inboxEventId, "msg_retry")).rejects.toThrow(
    "Diagnostics unavailable",
  );
  unavailable = false;
  await inbox.fail(job.inboxEventId, "msg_retry");
  expect(alerts).toEqual([
    {
      kind: "inbox_dead_letter",
      inboxEventId: job.inboxEventId,
      jobId: "msg_retry",
      errorClass: "JobDeliveryError",
    },
  ]);
  await inbox.fail(job.inboxEventId, "msg_retry");
  expect(alerts).toHaveLength(1);
});

test("the sweep re-enqueues a pending event whose job was lost, once it is five minutes old", async () => {
  restoreClock();
  const body = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.LOST" }));
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  // QStash accepted the job, then lost it with its failure callback.
  const [lost] = queue.take();

  clock.advance(5 * 60_000 - 1);
  expect(await inbox.requeueStalled()).toBe(0);
  expect(queue.take()).toEqual([]);

  clock.advance(1);
  expect(await inbox.requeueStalled()).toBe(1);
  const [requeued] = queue.take();
  expect(requeued).toEqual({ type: "process-inbox-event", inboxEventId: lost.inboxEventId });
  expect(await inbox.process(requeued.inboxEventId)).toEqual({ ok: true, status: "processed" });

  const tenantA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  const listed = await createConversationRepository(db, tenantA).listConversations();
  expect(listed.conversations).toHaveLength(1);
  // A second sweep finds nothing left to do.
  expect(await inbox.requeueStalled()).toBe(0);
  expect(queue.take()).toEqual([]);
});

test("the sweep leaves dead-lettered, settled and fresh events alone", async () => {
  restoreClock();
  const old = new Date(clock.now().getTime() - 60 * 60_000);
  await db.insert(inboxEvent).values([
    {
      id: "failed",
      dedupeKey: "failed",
      field: "messages",
      payload: {},
      status: "failed",
      receivedAt: old,
    },
    {
      id: "processed",
      dedupeKey: "processed",
      field: "messages",
      payload: {},
      status: "processed",
      receivedAt: old,
    },
    {
      id: "ignored",
      dedupeKey: "ignored",
      field: "messages",
      payload: {},
      status: "ignored",
      receivedAt: old,
    },
    { id: "fresh", dedupeKey: "fresh", field: "messages", payload: {}, receivedAt: clock.now() },
  ]);
  expect(await inbox.requeueStalled()).toBe(0);
  expect(queue.take()).toEqual([]);
});

test("one sweep re-enqueues at most 100 stalled events, oldest first", async () => {
  restoreClock();
  const start = clock.now().getTime() - 60 * 60_000;
  await db.insert(inboxEvent).values(
    Array.from({ length: 101 }, (_, index) => ({
      id: `stalled-${String(index).padStart(3, "0")}`,
      dedupeKey: `stalled-${index}`,
      field: "messages",
      payload: {},
      receivedAt: new Date(start + index * 1000),
    })),
  );
  expect(await inbox.requeueStalled()).toBe(100);
  const jobs = queue.take();
  expect(jobs[0]).toEqual({ type: "process-inbox-event", inboxEventId: "stalled-000" });
  expect(jobs.map(({ inboxEventId }) => inboxEventId)).not.toContain("stalled-100");
});

test("a queue failure fails the sweep run, and the next run retries the same events", async () => {
  restoreClock();
  await db.insert(inboxEvent).values({
    id: "stalled",
    dedupeKey: "stalled",
    field: "messages",
    payload: {},
    receivedAt: new Date(clock.now().getTime() - 60 * 60_000),
  });
  queue.failing = true;
  await expect(inbox.requeueStalled()).rejects.toThrow();
  queue.failing = false;
  expect(await inbox.requeueStalled()).toBe(1);
});

test("the sweep leaves a failing event to QStash's retries until 35 minutes after its last failure", async () => {
  restoreClock();
  const body = metaDelivery(textMessageChange({ phoneNumberId: "300", wamid: "wamid.RETRYING" }));
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  const [job] = queue.take();
  clock.advance(3 * 60_000);
  // Its third attempt fails; QStash's last retry comes about 30 minutes later.
  notifier.failNext();
  await expect(inbox.process(job.inboxEventId)).rejects.toThrow();

  clock.advance(35 * 60_000 - 1);
  expect(await inbox.requeueStalled()).toBe(0);
  // The last retry failed too, and its failure callback was lost.
  clock.advance(1);
  expect(await inbox.requeueStalled()).toBe(1);
  expect(queue.take()).toEqual([{ type: "process-inbox-event", inboxEventId: job.inboxEventId }]);
});

test("only an administrator can replay listed failures in bulk, each with a fresh set of automatic replays", async () => {
  restoreClock();
  const old = new Date(clock.now().getTime() - 24 * 60 * 60_000);
  const ids = Array.from(
    { length: 101 },
    (_, index) => `019a0871-5e00-7000-8000-${String(index).padStart(12, "0")}`,
  );
  await db.insert(inboxEvent).values([
    ...ids.map((id, index) => ({
      id,
      dedupeKey: id,
      field: "messages",
      payload: {},
      status: index % 2 ? ("failed" as const) : ("pending" as const),
      errorClass: "Error" as const,
      receivedAt: old,
      failedAt: old,
      autoRetries: 3,
      alertedAt: index % 2 ? old : null,
    })),
    {
      id: "processed",
      dedupeKey: "processed",
      field: "messages",
      payload: {},
      status: "processed",
      receivedAt: old,
    },
  ]);

  for (const actor of ["owner-a", "missing", "banned-admin"])
    expect(await inbox.replayFailures(actor)).toEqual({ ok: false, error: "forbidden" });
  expect(queue.take()).toEqual([]);

  expect(await inbox.replayFailures("admin", ids.slice(0, 2))).toEqual({ ok: true, requeued: 2 });
  expect(queue.take().map(({ inboxEventId }) => inboxEventId)).toEqual(ids.slice(0, 2));
  expect(await inbox.replayFailures("admin", ["processed"])).toEqual({ ok: true, requeued: 0 });
  expect(await inbox.replayFailures("admin", [])).toEqual({ ok: true, requeued: 0 });

  expect(await inbox.replayFailures("admin")).toEqual({ ok: true, requeued: 101 });
  expect(new Set(queue.take().map(({ inboxEventId }) => inboxEventId))).toEqual(new Set(ids));

  // Each one alerts again only after a new round of automatic replays.
  const alerts: Diagnostic[] = [];
  inbox = alertingInbox(alerts);
  await inbox.fail(ids[1], "msg_again");
  expect(alerts).toEqual([]);
  const failures = await inbox.listFailures("admin");
  expect(failures.ok && failures.events.find(({ id }) => id === ids[1])).toMatchObject({
    status: "failed",
    autoRetries: 0,
    nextAutoRetryAt: new Date(clock.now().getTime() + autoRetryDelaysMs[0]),
  });
});
