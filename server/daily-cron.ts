import { timingSafeEqual } from "node:crypto";
import type { InboxDiagnostics } from "@/modules/webhook-inbox";
import { runMaintenanceTasks, type MaintenanceTask } from "@/server/maintenance-tasks";

export const createDailyCronRoute = ({
  secret,
  tasks,
  diagnostics,
}: {
  secret: string | null;
  tasks: readonly MaintenanceTask[];
  diagnostics?: Pick<InboxDiagnostics, "log">;
}) => ({
  async GET(request: Request) {
    const headers = { "cache-control": "no-store" };
    if (!secret) return new Response(null, { status: 503, headers });
    const actual = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return new Response(null, { status: 401, headers });
    }
    return runMaintenanceTasks(tasks, (errorClass) =>
      diagnostics?.log({ kind: "daily_task_failed", errorClass }),
    );
  },
});
