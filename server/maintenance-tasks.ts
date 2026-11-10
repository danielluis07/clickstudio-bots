export type MaintenanceTask = { name: string; run(): Promise<unknown> };

// Runs independent tasks in order: one failure must not stop the next.
// `onFailure` records each failure (scrubbed) before the response is sent.
export const runMaintenanceTasks = async (
  tasks: readonly MaintenanceTask[],
  onFailure: (error: unknown, task: string) => Promise<void> | void,
) => {
  const results: { name: string; ok: boolean }[] = [];
  for (const task of tasks) {
    try {
      await task.run();
      results.push({ name: task.name, ok: true });
    } catch (error) {
      await onFailure(error, task.name);
      results.push({ name: task.name, ok: false });
    }
  }
  const ok = results.every((result) => result.ok);
  return Response.json(
    { ok, tasks: results },
    { status: ok ? 200 : 500, headers: { "cache-control": "no-store" } },
  );
};
