import { expect, onTestFinished, test } from "bun:test";
import { createQStashJobVerifier } from "@/platform/qstash";
import { createTestDiagnostics } from "@/test/support/diagnostics";
import {
  alertStaleSweep,
  createSweepRoute,
  recordSweepRun,
  staleSweepAfterMs,
} from "@/server/sweep";
import { createDailyCronRoute } from "@/server/daily-cron";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { qstashSigningKeys, signQStashRequest } from "@/test/support/qstash";

const url = "https://bots.example.com/api/jobs/sweep";
const verifier = createQStashJobVerifier(qstashSigningKeys);

const post = (route: ReturnType<typeof createSweepRoute>, signature?: string, body = "") =>
  route.POST(
    new Request(url, {
      method: "POST",
      body,
      headers: signature ? { "upstash-signature": signature } : {},
    }),
  );

test("the sweep refuses unauthenticated calls without running a task", async () => {
  let runs = 0;
  const tasks = [{ name: "count", run: async () => runs++ }];
  const route = createSweepRoute({ config: { verifier, url }, tasks });

  expect((await post(route)).status).toBe(401);
  expect((await post(route, "not-a-token")).status).toBe(401);
  const otherEndpoint = signQStashRequest({
    url: "https://bots.example.com/api/jobs/run-bot-turn",
    body: "",
  });
  expect((await post(route, otherEndpoint)).status).toBe(401);
  const wrongKey = signQStashRequest({ url, body: "", key: "sig_attacker" });
  expect((await post(route, wrongKey)).status).toBe(401);
  // Unconfigured, it refuses even a valid signature.
  const unconfigured = createSweepRoute({ config: null, tasks });
  expect((await post(unconfigured, signQStashRequest({ url, body: "" }))).status).toBe(503);
  expect(runs).toBe(0);
});

test("a signed sweep runs every task, and one failure does not stop the others", async () => {
  const ran: string[] = [];
  const diagnostics = createTestDiagnostics();
  const route = createSweepRoute({
    config: { verifier, url },
    diagnostics,
    tasks: [
      {
        name: "first",
        run: async () => {
          ran.push("first");
          throw new TypeError("Private 5511988887777");
        },
      },
      { name: "second", run: async () => ran.push("second") },
    ],
  });
  const response = await post(route, signQStashRequest({ url, body: "" }));
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    ok: false,
    tasks: [
      { name: "first", ok: false },
      { name: "second", ok: true },
    ],
  });
  expect(ran).toEqual(["first", "second"]);
  // A failed sweep task reaches Sentry, named by its task, without its message.
  expect(diagnostics.alerts).toEqual([
    {
      kind: "sweep_task_failed",
      errorClass: "TypeError",
      operation: "first",
      stack: expect.arrayContaining([expect.stringContaining("test/server/sweep.test.ts:")]),
    },
  ]);
  expect(JSON.stringify(diagnostics.alerts)).not.toContain("5511988887777");
});

test("a sweep whose tasks all succeed answers 200", async () => {
  const route = createSweepRoute({
    config: { verifier, url },
    tasks: [{ name: "only", run: async () => {} }],
  });
  const response = await post(route, signQStashRequest({ url, body: "" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, tasks: [{ name: "only", ok: true }] });
});

test("the daily watchdog alerts when no sweep finished in the last 30 minutes", async () => {
  const db = await createTestDatabase();
  onTestFinished(() => closeTestDatabase(db));
  const clock = createTestClock(new Date("2026-11-11T05:00:00Z"));
  const diagnostics = createTestDiagnostics();
  const secret = "cron-secret";
  // The daily cron, as Vercel calls it, with only the watchdog task.
  const daily = createDailyCronRoute({
    secret,
    diagnostics,
    tasks: [{ name: "alert-stale-sweep", run: () => alertStaleSweep({ db, clock, diagnostics }) }],
  });
  const runDaily = async () => {
    const response = await daily.GET(
      new Request("https://bots.example.com/api/cron/daily", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
  };
  // A signed sweep whose last task records the run.
  const sweep = createSweepRoute({
    config: { verifier, url },
    tasks: [{ name: "record-sweep-run", run: () => recordSweepRun({ db, clock }) }],
  });

  // No sweep has ever run: the schedule was never created.
  await runDaily();
  expect(diagnostics.alerts).toEqual([{ kind: "sweep_stale" }]);

  expect((await post(sweep, signQStashRequest({ url, body: "" }))).status).toBe(200);
  clock.advance(staleSweepAfterMs - 1);
  await runDaily();
  expect(diagnostics.alerts).toHaveLength(1);

  // Each run moves the record forward rather than adding a row.
  expect((await post(sweep, signQStashRequest({ url, body: "" }))).status).toBe(200);
  clock.advance(staleSweepAfterMs);
  await runDaily();
  expect(diagnostics.alerts).toEqual([
    { kind: "sweep_stale" },
    { kind: "sweep_stale", ageSeconds: staleSweepAfterMs / 1000 },
  ]);
});
