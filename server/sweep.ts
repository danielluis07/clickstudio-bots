import type { Database } from "@/db/database";
import { sweepRun } from "@/db/schema";
import type { Clock } from "@/platform/clock";
import { reportError, type Diagnostics } from "@/platform/diagnostics";
import { runMaintenanceTasks, type MaintenanceTask } from "@/server/maintenance-tasks";

// Six missed five-minute runs: long enough to ignore one slow or refused run.
export const staleSweepAfterMs = 30 * 60 * 1000;

// The sweep's last task (#182): records that this run reached its end, even
// when an earlier task failed, since those alert on their own.
export const recordSweepRun = async ({ db, clock }: { db: Database; clock: Clock }) => {
  const finishedAt = clock.now();
  await db
    .insert(sweepRun)
    .values({ finishedAt })
    .onConflictDoUpdate({ target: sweepRun.id, set: { finishedAt } });
};

// A daily task, run by Vercel independently of QStash: alerts `sweep_stale`
// when no sweep finished in the last 30 minutes. With no run ever recorded,
// it alerts without an age. Returns the age in seconds it alerted with.
export const alertStaleSweep = async ({
  db,
  clock,
  diagnostics,
}: {
  db: Database;
  clock: Clock;
  diagnostics?: Diagnostics;
}) => {
  const [last] = await db.select({ finishedAt: sweepRun.finishedAt }).from(sweepRun);
  const ageMs = last ? clock.now().getTime() - last.finishedAt.getTime() : null;
  if (ageMs !== null && ageMs < staleSweepAfterMs) return null;
  if (ageMs === null) {
    await diagnostics?.alert({ kind: "sweep_stale" });
    return "never" as const;
  }
  const ageSeconds = Math.floor(ageMs / 1000);
  await diagnostics?.alert({ kind: "sweep_stale", ageSeconds });
  return ageSeconds;
};

type JobVerifier = {
  verify(request: { signature: string | null; body: string; url: string }): Promise<boolean>;
};

// The sweep (ADR 0007): a QStash schedule calls it every few minutes to put
// stuck work back on the queue. Only a QStash signature for this exact URL
// runs it; unconfigured, it refuses every call.
export const createSweepRoute = ({
  config,
  tasks,
  diagnostics,
}: {
  config: { verifier: JobVerifier; url: string } | null;
  tasks: readonly MaintenanceTask[];
  diagnostics?: Diagnostics;
}) => ({
  async POST(request: Request) {
    const headers = { "cache-control": "no-store" };
    if (!config) return new Response(null, { status: 503, headers });
    const body = await request.text();
    const signature = request.headers.get("upstash-signature");
    if (!(await config.verifier.verify({ signature, body, url: config.url })))
      return new Response(null, { status: 401, headers });
    // A sweep task only fails unexpectedly (its database or queue is down).
    return runMaintenanceTasks(tasks, (error, operation) =>
      reportError(diagnostics, "sweep_task_failed", error, { operation }),
    );
  },
});
