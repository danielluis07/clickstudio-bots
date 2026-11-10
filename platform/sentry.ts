import { randomUUID } from "node:crypto";
import {
  NodeClient,
  defaultStackParser,
  makeNodeTransport,
  type ErrorEvent,
  type NodeOptions,
} from "@sentry/node";
import {
  isUsSentryDsn,
  scrubDiagnostic,
  type Diagnostic,
  type Diagnostics,
} from "@/platform/diagnostics";

// `location` or `fn (location)`, as `stackFrames` writes them.
const toSentryFrame = (frame: string) => {
  const match = /^(?:(.+) \()?(.+):(\d+):(\d+)\)?$/.exec(frame);
  if (!match) return [];
  const [, fn, filename, lineno, colno] = match;
  return [
    {
      ...(fn ? { function: fn } : {}),
      filename,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !filename.startsWith("node_modules/"),
    },
  ];
};

// Frames travel as the event's stack trace, not as a tag.
const toTags = (diagnostic: Diagnostic): Omit<Diagnostic, "stack"> => {
  const tags = { ...diagnostic };
  delete tags.stack;
  return tags;
};

const diagnosticOf = (event: ErrorEvent) => {
  const extra = event.extra;
  return extra && typeof extra === "object" && "diagnostic" in extra
    ? extra.diagnostic
    : event.tags;
};

// Rebuilt from the scrubbed Diagnostic alone: nothing the SDK collected on its
// own (request, user, breadcrumbs, frame variables or context lines) survives.
// Stack frames are code locations and go to Sentry; messages never do.
export const scrubSentryEvent = (event: ErrorEvent): ErrorEvent => {
  const clean = scrubDiagnostic(diagnosticOf(event));
  const errorClass = clean.errorClass ?? "Error";
  // Sentry lists the oldest call first.
  const frames = (clean.stack ?? []).flatMap(toSentryFrame).reverse();
  return {
    type: undefined,
    ...(event.event_id && /^[a-f0-9]{32}$/i.test(event.event_id)
      ? { event_id: event.event_id }
      : {}),
    ...(typeof event.timestamp === "number" ? { timestamp: event.timestamp } : {}),
    platform: "node",
    level: "error",
    message: clean.kind,
    tags: toTags(clean),
    exception: {
      values: [
        {
          type: errorClass,
          value: errorClass,
          ...(frames.length ? { stacktrace: { frames } } : {}),
        },
      ],
    },
  };
};

export const createDiagnostics = ({
  dsn,
  writeLog = (entry) => console.error(JSON.stringify(entry)),
  transport,
}: {
  dsn?: string;
  writeLog?: (entry: Diagnostic) => void;
  transport?: NodeOptions["transport"];
} = {}): Diagnostics => {
  if (dsn && !isUsSentryDsn(dsn)) throw new Error("Sentry requires a US project DSN");
  const deliveries = new Map<string, Set<() => void>>();
  // An isolated client with no integrations: no automatic request, console,
  // database, session, tracing or unhandled-error capture can ship content.
  const client = dsn
    ? new NodeClient({
        dsn,
        integrations: [],
        includeServerName: false,
        enableRuntimeChannelInjection: false,
        enableOpenTelemetrySetup: false,
        // SDK v11 replaces sendDefaultPii with explicit collection controls.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          graphQL: { document: false, variables: false },
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
          queues: false,
          stackFrameVariables: false,
          frameContextLines: 0,
        },
        tracesSampleRate: 0,
        sendClientReports: false,
        transport(options) {
          const delegate = (transport ?? makeNodeTransport)(options);
          return {
            async send(envelope) {
              const response = await delegate.send(envelope);
              const eventId = envelope[0].event_id;
              if (
                typeof eventId === "string" &&
                response.statusCode &&
                response.statusCode >= 200 &&
                response.statusCode < 300
              ) {
                for (const confirm of deliveries.get(eventId) ?? []) confirm();
              }
              return response;
            },
            flush: (timeout) => delegate.flush(timeout),
          };
        },
        stackParser: defaultStackParser,
        beforeSend(event, hint) {
          hint.attachments = [];
          return scrubSentryEvent(event);
        },
      })
    : null;
  client?.init();

  return {
    log: (entry: Diagnostic) => writeLog(scrubDiagnostic(entry)),
    async alert(entry: Diagnostic) {
      const clean = scrubDiagnostic(entry);
      writeLog(clean);
      if (!client) return;
      // Concurrent/retried callbacks use one Sentry event identity.
      const eventId = (
        clean.kind === "inbox_dead_letter" && clean.inboxEventId ? clean.inboxEventId : randomUUID()
      ).replaceAll("-", "");
      let delivered = false;
      const confirm = () => {
        delivered = true;
      };
      const listeners = deliveries.get(eventId) ?? new Set<() => void>();
      listeners.add(confirm);
      deliveries.set(eventId, listeners);
      try {
        client.captureEvent({
          event_id: eventId,
          level: "error",
          tags: toTags(clean),
          extra: { diagnostic: clean },
        });
        // Draining the buffer alone does not prove Sentry accepted the event.
        if (!(await client.flush(2000))) throw new Error("Diagnostic delivery timed out");
        if (!delivered) throw new Error("Diagnostic delivery failed");
      } finally {
        listeners.delete(confirm);
        if (listeners.size === 0) deliveries.delete(eventId);
      }
    },
  };
};
