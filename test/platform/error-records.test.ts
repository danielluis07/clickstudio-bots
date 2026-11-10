import { describe, expect, test } from "bun:test";
import { APICallError } from "ai";
import { DrizzleQueryError } from "drizzle-orm";
import type { ChannelRoute } from "@/modules/channels";
import { createBotCore, type BotTurn } from "@/modules/bot";
import {
  annotateError,
  describeError,
  logError,
  reportError,
  scrubDiagnostic,
} from "@/platform/diagnostics";
import { createWhatsAppAdapter } from "@/platform/whatsapp";
import { createWhatsAppTokenCipher } from "@/platform/whatsapp-credentials";
import { createTestBotRepository } from "@/test/support/bot";
import { createTestClock } from "@/test/support/clock";
import { captureConsoleErrors, createTestDiagnostics } from "@/test/support/diagnostics";
import { createTestModel } from "@/test/support/model";

const tenantId = "019a0871-5e00-7000-8000-00000000000a";
const conversationId = "019a0871-5e00-7000-8000-00000000000b";
const phone = "5511988887777";
const text = "Quero cancelar meu pedido da Maria Souza";

// node-postgres raises server errors with the protocol message's name.
const postgresError = (message: string) =>
  Object.assign(new Error(message), {
    name: "error",
    severity: "ERROR",
    code: "23505",
    detail: `Key (phone)=(${phone}) already exists.`,
  });

describe("error records", () => {
  test("an error whose message carries a phone number and message text logs neither", () => {
    // The message also imitates stack frames, which must not become frames.
    const message = `${text} ${phone}\n    at ${phone} (contact.js:1:1)\n    at evil (${phone}.js:2:2)`;
    const error = new DrizzleQueryError(
      `insert into message values ($1, $2)`,
      [phone, text],
      postgresError(message),
    );
    using console = captureConsoleErrors();
    logError("inbox_processing_failed", error, { tenantId, conversationId });
    expect(console.lines).toHaveLength(1);
    const [line] = console.lines;
    for (const secret of [phone, text, "Maria", "contact.js", "evil", "already exists"])
      expect(line).not.toContain(secret);
    const [entry] = console.entries();
    expect(entry).toMatchObject({
      kind: "inbox_processing_failed",
      errorClass: "DrizzleQueryError",
      causeClass: "DatabaseError",
      sqlState: "23505",
      tenantId,
      conversationId,
    });
    expect(entry.stack?.[0]).toContain("test/platform/error-records.test.ts:");
  });

  test("records rebuild from the allowlist: no field accepts free text", () => {
    expect(
      scrubDiagnostic({
        kind: "bot_job_failed",
        errorClass: "Error",
        stack: [`${text} (a.js:1:1)`, `${phone}`, "handler (server/bot-jobs.ts:12:3)"],
        sqlState: phone,
        httpStatus: Number(phone),
        metaCode: text,
        fbtraceId: phone,
        providerRequestId: text,
        operation: text,
        tenantId: phone,
        message: text,
      }),
    ).toEqual({
      kind: "bot_job_failed",
      errorClass: "Error",
      stack: ["handler (server/bot-jobs.ts:12:3)"],
    });
  });

  test("a stack frame outside the project keeps no machine path", () => {
    const error = new Error("boom");
    error.stack = [
      "Error: boom",
      "    at run (/home/maria.souza/app/node_modules/pg/lib/client.js:10:5)",
      "    at other (C:\\Users\\maria\\elsewhere\\file.js:3:4)",
    ].join("\n");
    expect(describeError(error).stack).toEqual([
      "run (node_modules/pg/lib/client.js:10:5)",
      "other (file.js:3:4)",
    ]);
  });

  test("ids annotated while an error propagates reach the record once", () => {
    const error = annotateError(new Error(text), { tenantId, conversationId });
    expect(describeError(new Error("wrapper", { cause: error }))).toMatchObject({
      tenantId,
      conversationId,
    });
  });

  test("a Sentry delivery failure never escapes the boundary that reports", async () => {
    const logs: unknown[] = [];
    await reportError(
      {
        log: (entry) => logs.push(entry),
        alert: async () => {
          throw new Error(`Sentry down ${phone}`);
        },
      },
      "bot_job_failed",
      new Error(text),
    );
    expect(logs).toEqual([
      expect.objectContaining({ kind: "diagnostic_delivery_failed", operation: "bot_job_failed" }),
    ]);
    expect(JSON.stringify(logs)).not.toContain(phone);
  });
});

describe("Meta failures", () => {
  const options = {
    appId: "100",
    appSecret: "secret-app-key",
    graphVersion: "v26.0",
    activeKeyVersion: "2026-10",
    encryptionKeys: { "2026-10": Buffer.alloc(32, 7).toString("base64") },
  };
  const context = { tenantId, wabaId: "200", phoneNumberId: "300" };
  const credential = createWhatsAppTokenCipher(
    options.activeKeyVersion,
    options.encryptionKeys,
  ).encrypt("secret-business-token", context);

  test("a failed send logs Meta's HTTP status, error code and trace id, never the reply", async () => {
    const adapter = createWhatsAppAdapter({
      ...options,
      fetch: async () =>
        Response.json(
          {
            error: {
              message: `(#131026) Message undeliverable to ${phone}: ${text}`,
              type: "OAuthException",
              code: 131026,
              error_subcode: 2494010,
              fbtrace_id: "AbCdEf123_xyz",
            },
          },
          { status: 400 },
        ),
    });
    using console = captureConsoleErrors();
    await expect(adapter.sendText({ ...context, credential, to: phone, text })).rejects.toThrow(
      "WhatsApp send failed",
    );
    const [entry] = console.entries();
    expect(entry).toMatchObject({
      kind: "meta_request_failed",
      operation: "sendText",
      errorClass: "WhatsAppRequestError",
      httpStatus: 400,
      metaCode: 131026,
      metaSubcode: 2494010,
      fbtraceId: "AbCdEf123_xyz",
      tenantId,
    });
    for (const secret of [phone, text, "secret-business-token", "undeliverable"])
      expect(console.lines.join("\n")).not.toContain(secret);
  });

  test("a Meta timeout is recorded by class, and a refused subscription still answers", async () => {
    const adapter = createWhatsAppAdapter({
      ...options,
      fetch: async () => {
        throw new DOMException(`timed out sending to ${phone}`, "TimeoutError");
      },
    });
    using console = captureConsoleErrors();
    expect(await adapter.unsubscribe({ ...context, credential })).toEqual({ ok: false });
    expect(console.entries()).toEqual([
      expect.objectContaining({
        kind: "meta_request_failed",
        operation: "unsubscribe",
        errorClass: "WhatsAppRequestError",
        causeClass: "TimeoutError",
        tenantId,
      }),
    ]);
    expect(console.lines.join("\n")).not.toContain(phone);
  });
});

describe("Model failures", () => {
  test("a Model failure that causes a Handoff is logged with the provider's status", async () => {
    const model = createTestModel();
    const repository = createTestBotRepository();
    repository.messages = [
      { author: "contact", text, sentAt: new Date("2026-03-10T11:59:00.000Z") },
    ];
    model.script(
      new APICallError({
        message: `Overloaded while answering "${text}"`,
        url: "https://api.anthropic.com/v1/messages",
        requestBodyValues: { messages: [{ role: "user", content: text }] },
        statusCode: 529,
        responseHeaders: { "request-id": "req_011CVabc123" },
        responseBody: JSON.stringify({ error: { message: text } }),
      }),
    );
    const turn: BotTurn = {
      scope: { channelId: "channel-a", tenantId } as ChannelRoute,
      conversationId,
    };
    const core = createBotCore({
      model,
      repository,
      clock: createTestClock(new Date("2026-03-10T12:00:00.000Z")),
    });
    using console = captureConsoleErrors();
    expect(await core.respond(turn)).toMatchObject({ kind: "handoff", reason: "bot_unavailable" });
    expect(console.entries()).toEqual([
      expect.objectContaining({
        kind: "bot_decision_failed",
        errorClass: "AI_APICallError",
        providerStatus: 529,
        providerRequestId: "req_011CVabc123",
        tenantId,
        conversationId,
      }),
    ]);
    expect(console.lines.join("\n")).not.toContain(text);
  });

  test("the test diagnostics helper scrubs like the real adapter", async () => {
    const diagnostics = createTestDiagnostics();
    await reportError(diagnostics, "bot_job_failed", new Error(text), { tenantId });
    expect(diagnostics.alerts).toEqual([
      expect.objectContaining({ kind: "bot_job_failed", errorClass: "Error", tenantId }),
    ]);
    expect(JSON.stringify(diagnostics.alerts)).not.toContain(text);
  });
});
