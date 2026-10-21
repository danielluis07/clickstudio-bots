import { expect, test } from "bun:test";
import { inboxEvent } from "@/db/schema";
import { createWebhookInbox, pruneInboxEvents } from "@/modules/webhook-inbox";
import { createDailyCronRoute } from "@/server/daily-cron";
import { createTestClock } from "@/test/support/clock";
import { createTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";

test("the authenticated daily cron prunes only inbox rows strictly older than 30 days", async () => {
  const db = await createTestDatabase();
  const clock = createTestClock(new Date("2026-10-21T12:00:00Z"));
  const cutoff = new Date("2026-09-21T12:00:00Z");
  await db.insert(inboxEvent).values([
    { id: "old-pending", dedupeKey: "old-pending", field: "messages", payload: {}, receivedAt: new Date("2026-09-21T11:59:59.999Z") },
    { id: "old-failed", dedupeKey: "old-failed", field: "messages", status: "failed", payload: {}, receivedAt: new Date("2026-09-20T12:00:00Z") },
    { id: "old-processed", dedupeKey: "old-processed", field: "messages", status: "processed", payload: {}, receivedAt: new Date("2026-09-20T12:00:00Z") },
    { id: "old-ignored", dedupeKey: "old-ignored", field: "messages", status: "ignored", payload: {}, receivedAt: new Date("2026-09-20T12:00:00Z") },
    { id: "boundary", dedupeKey: "boundary", field: "messages", payload: {}, receivedAt: cutoff },
    { id: "new", dedupeKey: "new", field: "messages", payload: {}, receivedAt: clock.now() },
  ]);
  const inbox = createWebhookInbox({ db, clock, queue: createTestJobQueue(), notifier: createTestNotifier(), appSecret: "secret" });
  const route = createDailyCronRoute({ secret: "cron-secret", tasks: [{ name: "prune-inbox", run: () => pruneInboxEvents(db, clock) }] });
  const get = (token?: string) => route.GET(new Request("https://bots.example.com/api/cron/daily", { headers: token ? { authorization: token } : {} }));
  expect((await get()).status).toBe(401);
  expect((await get("Bearer wrong")).status).toBe(401);
  expect((await get("cron-secret")).status).toBe(401);
  // Retention is the criterion itself; inspect storage to prove no unauthorized deletion.
  expect(await db.$count(inboxEvent)).toBe(6);
  const response = await get("Bearer cron-secret");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ok: true, tasks: [{ name: "prune-inbox", ok: true }] });
  for (const id of ["old-pending", "old-failed", "old-processed", "old-ignored"]) expect(await inbox.process(id)).toEqual({ ok: false, error: "not_found" });
  for (const id of ["boundary", "new"]) expect(await inbox.process(id)).toEqual({ ok: true, status: "ignored" });
  expect(await db.$count(inboxEvent)).toBe(2);
  expect((await get("Bearer cron-secret")).status).toBe(200);
});

test("cron fails closed without a secret and continues independent daily tasks after a failure", async () => {
  let ran = false;
  const tasks = [{ name: "fail", run: async () => { throw new Error("Private 5511988887777"); } }, { name: "next", run: async () => { ran = true; } }];
  const request = new Request("https://bots.example.com/api/cron/daily", { headers: { authorization: "Bearer cron-secret" } });
  expect((await createDailyCronRoute({ secret: null, tasks }).GET(request)).status).toBe(503);
  expect(ran).toBe(false);
  const response = await createDailyCronRoute({ secret: "cron-secret", tasks }).GET(request);
  expect(response.status).toBe(500);
  expect(ran).toBe(true);
  expect(await response.json()).toEqual({ ok: false, tasks: [{ name: "fail", ok: false }, { name: "next", ok: true }] });
});
