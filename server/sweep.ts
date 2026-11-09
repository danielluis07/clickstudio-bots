import type { InboxDiagnostics } from "@/modules/webhook-inbox";
import { runMaintenanceTasks, type MaintenanceTask } from "@/server/maintenance-tasks";

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
  diagnostics?: Pick<InboxDiagnostics, "log">;
}) => ({
  async POST(request: Request) {
    const headers = { "cache-control": "no-store" };
    if (!config) return new Response(null, { status: 503, headers });
    const body = await request.text();
    const signature = request.headers.get("upstash-signature");
    if (!(await config.verifier.verify({ signature, body, url: config.url })))
      return new Response(null, { status: 401, headers });
    return runMaintenanceTasks(tasks, (errorClass) =>
      diagnostics?.log({ kind: "sweep_task_failed", errorClass }),
    );
  },
});
