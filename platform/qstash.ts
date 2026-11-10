import { Client, Receiver } from "@upstash/qstash";

// Delivery retries per job type, never left to the plan's default. QStash
// backs off about 12 s, 2.5 min, then 30 min: enough to outlast a crashed
// Bot turn's two-minute lease. The sweep re-enqueues whatever is still stuck.
const deliveryRetries = { "process-inbox-event": 3, "run-bot-turn": 3 } as const;

// A job is its type plus ids; the type names the route that handles it.
type QueuedJob = { type: keyof typeof deliveryRetries } & Record<string, string>;

// Where QStash delivers a job, and so the URL its signature is bound to.
export const qstashJobUrl = (appUrl: string, type: string) =>
  new URL(`/api/jobs/${type}`, appUrl).toString();

export const createQStashJobQueue = ({
  token,
  baseUrl,
  appUrl,
}: {
  token: string;
  baseUrl: string;
  appUrl: string;
}) => {
  // Few, quick retries: the webhook must answer Meta promptly, and an
  // unacknowledged delivery is redelivered by Meta anyway.
  const client = new Client({
    token,
    baseUrl,
    devMode: false,
    enableTelemetry: false,
    retry: { retries: 2 },
  });
  return {
    async enqueue(jobs: readonly QueuedJob[]) {
      if (jobs.length === 0) return;
      const published = await client.batchJSON(
        jobs.map(({ type, ...ids }) => ({
          url: qstashJobUrl(appUrl, type),
          body: ids,
          retries: deliveryRetries[type],
          ...(type === "process-inbox-event"
            ? { failureCallback: qstashJobUrl(appUrl, "inbox-event-failed") }
            : {}),
          ...(type === "run-bot-turn"
            ? { flowControl: { key: `bot:${ids.conversationId}`, parallelism: 1 } }
            : {}),
        })),
      );
      if (published.length !== jobs.length || published.some((result) => !result?.messageId)) {
        throw new Error("QStash did not accept every job");
      }
    },
  };
};

// Creates or updates the QStash schedule that calls the sweep (ADR 0007).
// The fixed id makes it safe to run again. A failed run is not retried: the
// next one is five minutes away.
export const scheduleSweep = async ({
  token,
  baseUrl,
  appUrl,
}: {
  token: string;
  baseUrl: string;
  appUrl: string;
}) => {
  const client = new Client({ token, baseUrl, devMode: false, enableTelemetry: false });
  return client.schedules.create({
    scheduleId: "sweep",
    destination: qstashJobUrl(appUrl, "sweep"),
    cron: "*/5 * * * *",
    retries: 0,
  });
};

export const createQStashJobVerifier = (keys: {
  currentSigningKey: string;
  nextSigningKey: string;
}) => {
  const receiver = new Receiver({ ...keys, devMode: false });
  return {
    // `url` is the endpoint QStash was asked to call; a token signed for any
    // other endpoint, or another body, is rejected.
    async verify({
      signature,
      body,
      url,
    }: {
      signature: string | null;
      body: string;
      url: string;
    }) {
      if (!signature) return false;
      return receiver.verify({ signature, body, url }).catch(() => false);
    },
  };
};
