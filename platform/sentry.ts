import { NodeClient, defaultStackParser, makeNodeTransport, type ErrorEvent, type NodeOptions } from "@sentry/node";
import { isEuSentryDsn, scrubDiagnostic, type Diagnostic, type Diagnostics } from "@/platform/diagnostics";

export const scrubSentryEvent = (event: ErrorEvent): ErrorEvent => {
  const clean = scrubDiagnostic(event.tags);
  const errorClass = clean.errorClass ?? "Error";
  return {
    type: undefined,
    ...(event.event_id && /^[a-f0-9]{32}$/i.test(event.event_id) ? { event_id: event.event_id } : {}),
    ...(typeof event.timestamp === "number" ? { timestamp: event.timestamp } : {}),
    platform: "node", level: "error", message: clean.kind, tags: { ...clean },
    exception: { values: [{ type: errorClass, value: errorClass }] },
  };
};

export const createDiagnostics = ({ dsn, writeLog = (entry) => console.error(JSON.stringify(entry)), transport }: {
  dsn?: string;
  writeLog?: (entry: Diagnostic) => void;
  transport?: NodeOptions["transport"];
} = {}): Diagnostics => {
  if (dsn && !isEuSentryDsn(dsn)) throw new Error("Sentry requires an EU project DSN");
  // An isolated client with no integrations: no automatic request, console,
  // database, session, tracing or unhandled-error capture can ship content.
  const client = dsn ? new NodeClient({
    dsn, integrations: [], includeServerName: false, enableRuntimeChannelInjection: false, enableOpenTelemetrySetup: false,
    // SDK v11 replaces sendDefaultPii with explicit collection controls.
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
      databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0,
    },
    tracesSampleRate: 0, sendClientReports: false,
    transport: transport ?? makeNodeTransport, stackParser: defaultStackParser,
    beforeSend(event, hint) {
      hint.attachments = [];
      return scrubSentryEvent(event);
    },
  }) : null;
  client?.init();

  return {
    log: (entry) => writeLog(scrubDiagnostic(entry)),
    async alert(entry) {
      const clean = scrubDiagnostic(entry);
      writeLog(clean);
      if (!client) return;
      client.captureEvent({
        level: "error", tags: { ...clean },
        // Concurrent/retried callbacks use one Sentry event identity.
        ...(clean.kind === "inbox_dead_letter" && clean.inboxEventId ? { event_id: clean.inboxEventId.replaceAll("-", "") } : {}),
      });
      // Flush inside the invocation so a serverless freeze cannot lose it.
      if (!await client.flush(2000)) throw new Error("Diagnostic delivery timed out");
    },
  };
};
