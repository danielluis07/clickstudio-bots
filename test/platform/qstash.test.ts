import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createQStashJobQueue } from "@/platform/qstash";

let server: ReturnType<typeof Bun.serve>;
let received: { path: string; authorization: string | null; body: unknown }[] = [];
let accept = true;

beforeAll(() => {
  // Stands in for the QStash API.
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      received.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
        body: await request.json(),
      });
      if (!accept) return Response.json({ error: "quota exceeded" }, { status: 429 });
      return Response.json(
        (received.at(-1)!.body as unknown[]).map((_, index) => ({ messageId: `msg_${index}` })),
      );
    },
  });
});

afterAll(() => server.stop(true));

describe("QStash job queue", () => {
  test("Bot turns use per-Conversation flow control with parallelism one", async () => {
    received = [];
    await createQStashJobQueue({
      token: "token",
      baseUrl: server.url.origin,
      appUrl: "https://bots.example.com",
    }).enqueue([
      { type: "run-bot-turn", conversationId: "conversation-a" },
      { type: "run-bot-turn", conversationId: "conversation-b" },
    ]);
    const jobs = received[0].body as { headers: Record<string, string>; body: string }[];
    expect(jobs.map(({ headers }) => new Headers(headers).get("upstash-flow-control-key"))).toEqual(
      ["bot:conversation-a", "bot:conversation-b"],
    );
    expect(
      jobs.map(({ headers }) => new Headers(headers).get("upstash-flow-control-value")),
    ).toEqual(["parallelism=1", "parallelism=1"]);
    expect(jobs.map(({ body }) => JSON.parse(body))).toEqual([
      { conversationId: "conversation-a" },
      { conversationId: "conversation-b" },
    ]);
  });
  test("publishes each job to its route with a body of ids only", async () => {
    received = [];
    const queue = createQStashJobQueue({
      token: "qstash-token",
      baseUrl: server.url.origin,
      appUrl: "https://bots.example.com",
    });

    await queue.enqueue([
      { type: "process-inbox-event", inboxEventId: "event-1" },
      { type: "process-inbox-event", inboxEventId: "event-2" },
    ]);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ path: "/v2/batch", authorization: "Bearer qstash-token" });
    const messages = received[0].body as {
      destination: string;
      body: string;
      headers: Record<string, string>;
    }[];
    expect(
      messages.map(({ destination, body }) => ({ destination, body: JSON.parse(body) })),
    ).toEqual([
      {
        destination: "https://bots.example.com/api/jobs/process-inbox-event",
        body: { inboxEventId: "event-1" },
      },
      {
        destination: "https://bots.example.com/api/jobs/process-inbox-event",
        body: { inboxEventId: "event-2" },
      },
    ]);
    expect(
      messages.map(({ headers }) => new Headers(headers).get("upstash-failure-callback")),
    ).toEqual([
      "https://bots.example.com/api/jobs/inbox-event-failed",
      "https://bots.example.com/api/jobs/inbox-event-failed",
    ]);
  });

  test("each job type publishes with an explicit delivery retry count", async () => {
    received = [];
    await createQStashJobQueue({
      token: "token",
      baseUrl: server.url.origin,
      appUrl: "https://bots.example.com",
    }).enqueue([
      { type: "process-inbox-event", inboxEventId: "event-1" },
      { type: "run-bot-turn", conversationId: "conversation-a" },
    ]);
    const jobs = received[0].body as { headers: Record<string, string> }[];
    expect(jobs.map(({ headers }) => new Headers(headers).get("upstash-retries"))).toEqual([
      "3",
      "3",
    ]);
  });

  test("fails the enqueue when QStash refuses the batch", async () => {
    accept = false;
    const queue = createQStashJobQueue({
      token: "qstash-token",
      baseUrl: server.url.origin,
      appUrl: "https://bots.example.com",
    });
    await expect(
      queue.enqueue([{ type: "process-inbox-event", inboxEventId: "event-1" }]),
    ).rejects.toThrow();
    accept = true;
  });
});
