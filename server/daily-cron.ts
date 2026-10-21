import { timingSafeEqual } from "node:crypto";
import type { InboxDiagnostics } from "@/modules/webhook-inbox";
import { classifyError } from "@/platform/diagnostics";

type DailyTask = { name: string; run(): Promise<unknown> };

export const createDailyCronRoute = ({ secret, tasks, diagnostics }: {
  secret: string | null;
  tasks: readonly DailyTask[];
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
    const results: { name: string; ok: boolean }[] = [];
    // Add later daily tasks here via composition; one failure must not stop
    // independent cleanup tasks from running in the same invocation.
    for (const task of tasks) {
      try {
        await task.run();
        results.push({ name: task.name, ok: true });
      } catch (error) {
        diagnostics?.log({ kind: "daily_task_failed", errorClass: classifyError(error) });
        results.push({ name: task.name, ok: false });
      }
    }
    const ok = results.every((result) => result.ok);
    return Response.json({ ok, tasks: results }, { status: ok ? 200 : 500, headers });
  },
});
