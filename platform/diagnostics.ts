export const errorClasses = [
  "Error", "TypeError", "SyntaxError", "RangeError", "ReferenceError",
  "URIError", "AggregateError", "AbortError", "TimeoutError", "DatabaseError",
  "QueueError", "JobDeliveryError",
] as const;

export type ErrorClass = typeof errorClasses[number];

export type Diagnostic = {
  kind: "inbox_processing_failed" | "inbox_dead_letter" | "daily_task_failed";
  errorClass?: ErrorClass;
  inboxEventId?: string;
  tenantId?: string;
  conversationId?: string;
  jobId?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rebuild from an allowlist rather than attempting to find every PII field.
export const scrubDiagnostic = (input: unknown): Diagnostic => {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const kind = source.kind === "inbox_dead_letter" || source.kind === "daily_task_failed"
    ? source.kind : "inbox_processing_failed";
  const clean: Diagnostic = { kind };
  if (errorClasses.includes(source.errorClass as ErrorClass)) clean.errorClass = source.errorClass as ErrorClass;
  for (const key of ["inboxEventId", "tenantId", "conversationId"] as const) {
    if (typeof source[key] === "string" && uuidPattern.test(source[key])) clean[key] = source[key];
  }
  if (typeof source.jobId === "string" && /^msg_[a-zA-Z0-9_-]{1,128}$/.test(source.jobId)) clean.jobId = source.jobId;
  return clean;
};

export const isEuSentryDsn = (dsn: string) => {
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" && /^o\d+\.ingest\.de\.sentry\.io$/.test(url.hostname)
      && Boolean(url.username) && !url.password && /^\/\d+$/.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
};

// Error messages, causes, stacks and arbitrary custom names may contain content.
export const classifyError = (error: unknown): ErrorClass => {
  if (!(error instanceof Error)) return "Error";
  const name = error.name;
  return errorClasses.includes(name as ErrorClass) ? name as ErrorClass : "Error";
};
