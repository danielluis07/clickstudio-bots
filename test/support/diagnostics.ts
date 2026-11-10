import { spyOn } from "bun:test";
import { scrubDiagnostic, type Diagnostic, type Diagnostics } from "@/platform/diagnostics";

// Records what would be logged and what would reach Sentry, scrubbed as the
// real adapter scrubs it.
export const createTestDiagnostics = () => {
  const logs: Diagnostic[] = [];
  const alerts: Diagnostic[] = [];
  return {
    logs,
    alerts,
    log: (entry) => {
      logs.push(scrubDiagnostic(entry));
    },
    async alert(entry) {
      alerts.push(scrubDiagnostic(entry));
    },
  } satisfies Diagnostics & { logs: unknown; alerts: unknown };
};

// Captures the structured lines written to `console.error` by default
// loggers, restoring the console when the returned function is disposed.
export const captureConsoleErrors = () => {
  const lines: string[] = [];
  const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  return {
    lines,
    entries: () => lines.map((line) => JSON.parse(line) as Diagnostic),
    [Symbol.dispose]: () => spy.mockRestore(),
  };
};
