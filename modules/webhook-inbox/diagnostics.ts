import type { Diagnostic } from "@/platform/diagnostics";

export interface InboxDiagnostics {
  log(entry: Diagnostic): void;
  alert(entry: Diagnostic): Promise<void>;
}
