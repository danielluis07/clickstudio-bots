import { timingSafeEqual } from "node:crypto";
import { reportError, type Diagnostics } from "@/platform/diagnostics";
import { runMaintenanceTasks, type MaintenanceTask } from "@/server/maintenance-tasks";

export const createDailyCronRoute = ({
  secret,
  tasks,
  diagnostics,
}: {
  secret: string | null;
  tasks: readonly MaintenanceTask[];
  diagnostics?: Diagnostics;
}) => ({
  async GET(request: Request) {
    const headers = { "cache-control": "no-store" };
    if (!secret) return new Response(null, { status: 503, headers });
    const actual = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return new Response(null, { status: 401, headers });
    }
    // Vercel does not retry a failed cron, so every failed task alerts: a
    // Tenant deletion or inbox pruning that stops must not go unnoticed.
    return runMaintenanceTasks(tasks, (error, operation) =>
      reportError(diagnostics, "daily_task_failed", error, { operation }),
    );
  },
});
