// Error records for logs and Sentry (#136). One rule at every boundary:
// catch, record a scrubbed Diagnostic, then return what the caller expects.
//
// A record carries an error's class, stack frames, SQLSTATE, HTTP status,
// Meta and Model provider codes and request ids, and the Tenant,
// Conversation and inbox event ids. It never carries error messages, request
// or response bodies, message text, names or phone numbers: every field is
// rebuilt from an allowlist and validated, never copied from the error.

export const errorClasses = [
  "Error",
  "TypeError",
  "SyntaxError",
  "RangeError",
  "ReferenceError",
  "URIError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
  "DatabaseError",
  "QueueError",
  "JobDeliveryError",
  "DrizzleQueryError",
  "TransactionRollbackError",
  "ZodError",
  "TRPCError",
  "WhatsAppRequestError",
  "RetryableError",
  "CredentialRejectedError",
  "AI_APICallError",
  "AI_RetryError",
  "AI_NoOutputGeneratedError",
  "AI_InvalidArgumentError",
  "AI_TypeValidationError",
  "AI_JSONParseError",
  "GatewayAuthenticationError",
  "GatewayFailedDependencyError",
  "GatewayForbiddenError",
  "GatewayInternalServerError",
  "GatewayInvalidRequestError",
  "GatewayModelNotFoundError",
  "GatewayNotFoundError",
  "GatewayRateLimitError",
  "GatewayResponseError",
  "GatewayTimeoutError",
] as const;

export type ErrorClass = (typeof errorClasses)[number];

export const diagnosticKinds = [
  "inbox_processing_failed",
  "inbox_dead_letter",
  "inbox_enqueue_failed",
  "inbox_failure_callback_failed",
  "inbox_replay_failed",
  "webhook_receive_failed",
  "daily_task_failed",
  "sweep_task_failed",
  "bot_job_failed",
  "bot_decision_failed",
  "bot_turn_record_failed",
  "bot_handoff_spike",
  "inbox_queue_stale",
  "channel_unhealthy",
  "channel_health_record_failed",
  "meta_request_failed",
  "whatsapp_configuration_invalid",
  "email_send_failed",
  "notification_failed",
  "trpc_procedure_failed",
  "diagnostic_delivery_failed",
] as const;

export type DiagnosticKind = (typeof diagnosticKinds)[number];

// Kinds that report a condition the sweep observed, not a thrown error. Sentry
// groups each into one issue (per Tenant where it names one), however many
// sweeps see it.
export const conditionKinds = [
  "bot_handoff_spike",
  "inbox_queue_stale",
  "channel_unhealthy",
] as const satisfies readonly DiagnosticKind[];

export type Diagnostic = {
  kind: DiagnosticKind;
  errorClass?: ErrorClass;
  // The innermost known class in the `cause` chain, e.g. the pg error under
  // a DrizzleQueryError or the timeout under a failed Meta request.
  causeClass?: ErrorClass;
  // Code locations only, most recent call first: `fn (path:line:col)`.
  stack?: string[];
  sqlState?: string;
  httpStatus?: number;
  metaCode?: number;
  metaSubcode?: number;
  fbtraceId?: string;
  providerStatus?: number;
  providerRequestId?: string;
  // A code-defined name: the tRPC path, maintenance task, Meta call or the
  // Channel health an unhealthy Channel reached.
  operation?: string;
  inboxEventId?: string;
  tenantId?: string;
  conversationId?: string;
  jobId?: string;
  // Counts for a condition: the oldest pending inbox event's age, or a
  // Tenant's Handoffs out of its Bot turns.
  ageSeconds?: number;
  handoffs?: number;
  turns?: number;
};

// The diagnostics port shared by modules, routes and the Sentry adapter.
export interface Diagnostics {
  log(entry: Diagnostic): void;
  alert(entry: Diagnostic): Promise<void>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Vendor ids always contain a letter, so a phone number never passes.
const vendorIdPattern = /^(?=.*[A-Za-z])[A-Za-z0-9_-]{1,128}$/;
const operationPattern = /^[a-z][A-Za-z0-9._-]{0,63}$/;
// A frame is `location` or `name (location)`. Names are code identifiers,
// so words separated by spaces (prose) never match.
const frameName = String.raw`(?:async |new )?(?:<anonymous>|[A-Za-z_$][\w$]*(?:\.(?:<anonymous>|[\w$]+)){0,6})(?: \[as [\w$]+\])?`;
const frameLocation = String.raw`[\w$./@+~[\]-]{1,200}:\d{1,7}:\d{1,7}`;
const framePattern = new RegExp(`^(?:${frameName} \\(${frameLocation}\\)|${frameLocation})$`);
const maxFrames = 20;

const integerIn = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const isErrorClass = (value: unknown): value is ErrorClass =>
  errorClasses.includes(value as ErrorClass);

const isFrame = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 300 && framePattern.test(value);

// Rebuild from an allowlist rather than attempting to find every PII field.
export const scrubDiagnostic = (input: unknown): Diagnostic => {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const kind = diagnosticKinds.includes(source.kind as DiagnosticKind)
    ? (source.kind as DiagnosticKind)
    : "inbox_processing_failed";
  const clean: Diagnostic = { kind };
  if (isErrorClass(source.errorClass)) clean.errorClass = source.errorClass;
  if (isErrorClass(source.causeClass)) clean.causeClass = source.causeClass;
  if (Array.isArray(source.stack)) {
    const frames = source.stack.slice(0, maxFrames).filter(isFrame);
    if (frames.length) clean.stack = frames;
  }
  if (typeof source.sqlState === "string" && /^[0-9A-Z]{5}$/.test(source.sqlState))
    clean.sqlState = source.sqlState;
  for (const key of ["httpStatus", "providerStatus"] as const)
    if (integerIn(source[key], 100, 599)) clean[key] = source[key] as number;
  for (const key of ["metaCode", "metaSubcode"] as const)
    if (integerIn(source[key], 0, 99_999_999)) clean[key] = source[key] as number;
  for (const key of ["fbtraceId", "providerRequestId"] as const)
    if (typeof source[key] === "string" && vendorIdPattern.test(source[key]))
      clean[key] = source[key];
  if (typeof source.operation === "string" && operationPattern.test(source.operation))
    clean.operation = source.operation;
  for (const key of ["inboxEventId", "tenantId", "conversationId"] as const) {
    if (typeof source[key] === "string" && uuidPattern.test(source[key])) clean[key] = source[key];
  }
  if (typeof source.jobId === "string" && /^msg_[a-zA-Z0-9_-]{1,128}$/.test(source.jobId))
    clean.jobId = source.jobId;
  for (const key of ["ageSeconds", "handoffs", "turns"] as const)
    if (integerIn(source[key], 0, 1_000_000_000)) clean[key] = source[key] as number;
  return clean;
};

export const isUsSentryDsn = (dsn: string) => {
  try {
    const url = new URL(dsn);
    return (
      url.protocol === "https:" &&
      /^o\d+\.ingest(?:\.us)?\.sentry\.io$/.test(url.hostname) &&
      Boolean(url.username) &&
      !url.password &&
      /^\/\d+$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    // An unparseable DSN is a configuration answer, not a failure.
    return false;
  }
};

const fieldOf = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

// node-postgres names its server errors after the protocol message: "error".
const isPostgresError = (error: unknown) =>
  error instanceof Error &&
  typeof fieldOf(error, "severity") === "string" &&
  typeof fieldOf(error, "code") === "string" &&
  /^[0-9A-Z]{5}$/.test(fieldOf(error, "code") as string);

// Error messages, causes, stacks and arbitrary custom names may contain content.
export const classifyError = (error: unknown): ErrorClass => {
  if (!(error instanceof Error)) return "Error";
  if (isPostgresError(error)) return "DatabaseError";
  return isErrorClass(error.name) ? error.name : "Error";
};

const causeChain = (error: unknown) => {
  const chain: unknown[] = [];
  for (let current = error; current !== undefined && chain.length < 6;) {
    if (chain.includes(current)) break;
    chain.push(current);
    // RetryError keeps the failure that decided it in `lastError`.
    current = fieldOf(current, "cause") ?? fieldOf(current, "lastError");
  }
  return chain;
};

const relativeLocation = (location: string) => {
  const path = location.replace(/^file:\/\//, "").replaceAll("\\", "/");
  const root = `${process.cwd().replaceAll("\\", "/")}/`;
  if (path.startsWith(root)) return path.slice(root.length);
  // Absolute paths can name the machine's user; keep only the package part.
  const dependency = path.lastIndexOf("node_modules/");
  if (dependency >= 0) return path.slice(dependency);
  return path.slice(path.lastIndexOf("/") + 1);
};

// Frames come only from what V8 writes after the message, so a message that
// imitates frames cannot inject text. A stack that does not contain the
// current message (it was rewritten) yields no frames at all.
export const stackFrames = (error: Error): string[] | undefined => {
  const stack = typeof error.stack === "string" ? error.stack : "";
  const message = typeof error.message === "string" ? error.message : "";
  const start = message ? stack.indexOf(message) : 0;
  if (start < 0) return undefined;
  const frames = stack
    .slice(start + message.length)
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const match = /^\s+at (?:(.+?) \((.+)\)|(.+))$/.exec(line);
      if (!match) return [];
      const name = match[1];
      const location = /^(.*):(\d+):(\d+)$/.exec(match[2] ?? match[3]);
      if (!location) return [];
      const where = `${relativeLocation(location[1])}:${location[2]}:${location[3]}`;
      return [name ? `${name} (${where})` : where];
    })
    .filter(isFrame)
    .slice(0, maxFrames);
  return frames.length ? frames : undefined;
};

type DiagnosticIds = Pick<Diagnostic, "tenantId" | "conversationId" | "inboxEventId">;
const annotations = new WeakMap<object, DiagnosticIds>();

// Lets a module attach ids it knows to an error it rethrows, so the boundary
// that finally records the error can name the Tenant and Conversation.
export const annotateError = <T>(error: T, ids: DiagnosticIds): T => {
  if (error && typeof error === "object")
    annotations.set(error, { ...ids, ...annotations.get(error) });
  return error;
};

const responseHeader = (error: unknown, name: string) => {
  const headers = fieldOf(error, "responseHeaders");
  const value = fieldOf(headers, name);
  return typeof value === "string" ? value : undefined;
};

// Reads only known, typed fields from the error and its causes.
export const describeError = (error: unknown): Omit<Diagnostic, "kind"> => {
  const chain = causeChain(error);
  const facts: Omit<Diagnostic, "kind"> = { errorClass: classifyError(error) };
  if (error instanceof Error) facts.stack = stackFrames(error);
  for (const link of chain.slice(1)) {
    const linkClass = classifyError(link);
    if (link instanceof Error && linkClass !== "Error") facts.causeClass = linkClass;
  }
  for (const link of chain) {
    if (!(link instanceof Error)) continue;
    if (isPostgresError(link)) facts.sqlState ??= fieldOf(link, "code") as string;
    if (link.name === "WhatsAppRequestError") {
      for (const key of ["httpStatus", "metaCode", "metaSubcode", "fbtraceId"] as const)
        if (facts[key] === undefined) Object.assign(facts, { [key]: fieldOf(link, key) });
    }
    // AI SDK APICallError and AI Gateway errors both expose `statusCode`.
    const statusCode = fieldOf(link, "statusCode");
    if (
      (link.name === "AI_APICallError" || link.name.startsWith("Gateway")) &&
      typeof statusCode === "number"
    ) {
      facts.providerStatus ??= statusCode;
      const generationId = fieldOf(link, "generationId");
      facts.providerRequestId ??=
        responseHeader(link, "request-id") ??
        responseHeader(link, "x-request-id") ??
        (typeof generationId === "string" ? generationId : undefined);
    }
    Object.assign(facts, { ...annotations.get(link), ...facts });
  }
  return scrubFacts(facts);
};

const scrubFacts = (facts: Omit<Diagnostic, "kind">): Omit<Diagnostic, "kind"> => {
  const clean: Partial<Diagnostic> = scrubDiagnostic({ ...facts, kind: "inbox_processing_failed" });
  delete clean.kind;
  return clean;
};

export const writeDiagnostic = (entry: Diagnostic) =>
  console.error(JSON.stringify(scrubDiagnostic(entry)));

// The caller's context wins, but an unknown (undefined) id never erases one
// the error was annotated with.
const errorEntry = (
  kind: DiagnosticKind,
  error: unknown,
  context: Omit<Diagnostic, "kind">,
): Diagnostic => ({
  ...describeError(error),
  ...Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined)),
  kind,
});

// Logs an expected failure: the caller handles it and nothing alerts.
export const logError = (
  kind: DiagnosticKind,
  error: unknown,
  context: Omit<Diagnostic, "kind"> = {},
  log: (entry: Diagnostic) => void = writeDiagnostic,
) => log(errorEntry(kind, error, context));

// Records an unexpected failure and sends it to Sentry. It never throws: a
// boundary still answers its caller when Sentry is down, and the record is
// already in the log before delivery is attempted.
export const reportError = async (
  diagnostics: Diagnostics | undefined,
  kind: DiagnosticKind,
  error: unknown,
  context: Omit<Diagnostic, "kind"> = {},
) => {
  const entry = errorEntry(kind, error, context);
  if (!diagnostics) return writeDiagnostic(entry);
  try {
    await diagnostics.alert(entry);
  } catch (deliveryError) {
    logError("diagnostic_delivery_failed", deliveryError, { operation: kind }, diagnostics.log);
  }
};
