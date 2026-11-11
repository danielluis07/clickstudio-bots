import { expect, test } from "bun:test";
import { createTransport } from "@sentry/node";
import { classifyError, scrubDiagnostic } from "@/platform/diagnostics";
import { createDiagnostics, scrubSentryEvent } from "@/platform/sentry";

const inboxEventId = "019a0871-5e00-7000-8000-000000000001";

test("diagnostics keep only known error classes and IDs even when sensitive data hides in arbitrary fields", () => {
  const privateText = "Minha mensagem privada 5511988887777";
  const error = new Error(privateText);
  error.name = privateText;
  expect(classifyError(error)).toBe("Error");
  expect(classifyError(new TypeError(privateText))).toBe("TypeError");
  const dirty = {
    kind: "inbox_dead_letter",
    inboxEventId,
    errorClass: "TypeError",
    jobId: "msg_abc123",
    tenantId: "5511988887777",
    conversationId: privateText,
    request: { data: { body: privateText }, headers: { authorization: privateText } },
    text: privateText,
    phone: "5511988887777",
    error,
  };
  expect(scrubDiagnostic(dirty)).toEqual({
    kind: "inbox_dead_letter",
    inboxEventId,
    errorClass: "TypeError",
    jobId: "msg_abc123",
  });
  expect(
    scrubSentryEvent({
      type: undefined,
      message: privateText,
      tags: { ...dirty, request: privateText, error: privateText },
      extra: dirty,
      contexts: { private: dirty },
      user: { email: "private@example.com", ip_address: "127.0.0.1" },
      request: { data: privateText, url: `https://example.com/${privateText}` },
      breadcrumbs: [{ message: privateText, data: dirty }],
      exception: {
        values: [
          { type: privateText, value: privateText, stacktrace: { frames: [{ vars: dirty }] } },
        ],
      },
    }),
  ).toEqual({
    type: undefined,
    platform: "node",
    level: "error",
    message: "inbox_dead_letter",
    tags: { kind: "inbox_dead_letter", inboxEventId, errorClass: "TypeError", jobId: "msg_abc123" },
    exception: { values: [{ type: "TypeError", value: "TypeError" }] },
  });
});

test("the Sentry transport and structured logger both receive scrubbed data", async () => {
  for (const dsn of [
    "https://publickey@o123.ingest.us.sentry.io/456",
    "https://publickey@o123.ingest.sentry.io/456",
  ]) {
    const logs: unknown[] = [];
    const envelopes: unknown[] = [];
    const diagnostics = createDiagnostics({
      dsn,
      writeLog: (entry) => logs.push(entry),
      transport: () => ({
        send: async (envelope) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    const entry = {
      kind: "inbox_dead_letter" as const,
      inboxEventId,
      errorClass: "Error" as const,
      text: "Segredo do contato",
      body: { phone: "5511988887777" },
    };
    await diagnostics.alert(entry);
    expect(logs).toEqual([{ kind: "inbox_dead_letter", inboxEventId, errorClass: "Error" }]);
    expect(envelopes).toHaveLength(1);
    const serialized = JSON.stringify(envelopes);
    expect(serialized).toContain(inboxEventId);
    for (const secret of ["Segredo do contato", "5511988887777"])
      expect(serialized).not.toContain(secret);
  }
});

test("Sentry refuses non-US or malformed DSNs and diagnostics still log when Sentry is unconfigured", async () => {
  for (const dsn of [
    "https://key@o123.ingest.de.sentry.io/456",
    "http://key@o123.ingest.us.sentry.io/456",
    "https://key@o123.ingest.us.sentry.io.example.com/456",
    "not-a-dsn",
    "https://key:secret@o123.ingest.us.sentry.io/456",
    "https://key@o123.ingest.us.sentry.io/456?body=private",
  ])
    expect(() => createDiagnostics({ dsn })).toThrow("US");
  const logs: unknown[] = [];
  await createDiagnostics({ writeLog: (entry) => logs.push(entry) }).alert({
    kind: "inbox_dead_letter",
    inboxEventId,
  });
  expect(logs).toEqual([{ kind: "inbox_dead_letter", inboxEventId }]);
});

test("a rejected Sentry delivery is retryable instead of being acknowledged when the buffer drains", async () => {
  for (const rejectedStatus of [429, 503]) {
    let statusCode = rejectedStatus;
    let requests = 0;
    const diagnostics = createDiagnostics({
      dsn: "https://publickey@o123.ingest.us.sentry.io/456",
      writeLog() {},
      transport: (options) =>
        createTransport(options, async () => {
          requests += 1;
          return { statusCode, headers: { "retry-after": "0", "x-sentry-rate-limits": null } };
        }),
    });
    await expect(diagnostics.alert({ kind: "inbox_dead_letter", inboxEventId })).rejects.toThrow(
      "Diagnostic delivery failed",
    );
    statusCode = 200;
    await diagnostics.alert({ kind: "inbox_dead_letter", inboxEventId });
    expect(requests).toBe(2);
  }
});

test("Sentry gets a limited number of events per kind per window, and every record is still logged", async () => {
  let now = 0;
  const logs: unknown[] = [];
  const events: string[] = [];
  const diagnostics = createDiagnostics({
    dsn: "https://publickey@o123.ingest.us.sentry.io/456",
    writeLog: (entry) => logs.push(entry),
    limit: { events: 2, windowMs: 60_000 },
    now: () => now,
    transport: () => ({
      send: async (envelope) => {
        events.push(JSON.stringify(envelope).includes("bot_job_failed") ? "bot" : "inbox");
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  for (let index = 0; index < 4; index++) await diagnostics.alert({ kind: "bot_job_failed" });
  // Another kind has its own limit.
  await diagnostics.alert({ kind: "inbox_dead_letter", inboxEventId });
  expect(events).toEqual(["bot", "bot", "inbox"]);
  expect(logs).toHaveLength(5);

  now = 60_000;
  await diagnostics.alert({ kind: "bot_job_failed" });
  expect(events).toEqual(["bot", "bot", "inbox", "bot"]);
});

test("condition alerts keep their counts and group in Sentry by kind and Tenant", () => {
  const tenantId = "019a0871-5e00-7000-8000-000000000002";
  const spike = { kind: "bot_handoff_spike", tenantId, handoffs: 4, turns: 9 };
  expect(scrubDiagnostic({ ...spike, handoffs: -1, turns: "9", ageSeconds: 1.5 })).toEqual({
    kind: "bot_handoff_spike",
    tenantId,
  });
  expect(scrubSentryEvent({ type: undefined, extra: { diagnostic: spike } })).toMatchObject({
    message: "bot_handoff_spike",
    fingerprint: ["bot_handoff_spike", tenantId],
    tags: spike,
  });
  expect(
    scrubSentryEvent({
      type: undefined,
      extra: { diagnostic: { kind: "inbox_queue_stale", ageSeconds: 960 } },
    }),
  ).toMatchObject({
    fingerprint: ["inbox_queue_stale", "all"],
    tags: { kind: "inbox_queue_stale", ageSeconds: 960 },
  });
  // Thrown errors keep Sentry's own grouping.
  expect(
    scrubSentryEvent({ type: undefined, extra: { diagnostic: { kind: "bot_job_failed" } } }),
  ).not.toHaveProperty("fingerprint");
});
