import { classifyError, type ErrorClass } from "@/platform/diagnostics";

export type MaintenanceTask = { name: string; run(): Promise<unknown> };

// Runs independent tasks in order: one failure must not stop the next, and
// errors reach `onFailure` only as their class, never their content.
export const runMaintenanceTasks = async (
  tasks: readonly MaintenanceTask[],
  onFailure: (errorClass: ErrorClass) => void,
) => {
  const results: { name: string; ok: boolean }[] = [];
  for (const task of tasks) {
    try {
      await task.run();
      results.push({ name: task.name, ok: true });
    } catch (error) {
      onFailure(classifyError(error));
      results.push({ name: task.name, ok: false });
    }
  }
  const ok = results.every((result) => result.ok);
  return Response.json(
    { ok, tasks: results },
    { status: ok ? 200 : 500, headers: { "cache-control": "no-store" } },
  );
};
