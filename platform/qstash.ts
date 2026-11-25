import { Client, Receiver } from "@upstash/qstash";

// Delivery retries per job type, never left to the plan's default. The sweep
// re-enqueues whatever is still stuck.
const deliveryRetries = { "process-inbox-event": 3, "run-bot-turn": 3 } as const;

// QStash's default backoff (about 12 s, 2.5 min, then 30 min) suits inbox
// events. A Contact waits on a Bot job's retry, which most often follows a
// transient Model failure, so it comes back after 2 s, then 30 s, then 2 min
// (`retried` counts from 0). The later ones give a rate limit time to clear,
// and together they still outlast a crashed turn's two-minute lease. The
// `botTurnAttempts` (`@/modules/bot`) deliveries end about 32 s after the
// first.
const retryDelays: Partial<Record<keyof typeof deliveryRetries, string>> = {
  "run-bot-turn": "min(120000, 2000 * pow(15, retried))",
};

// A job is its type plus ids; the type names the route that handles it. A
// delay postpones delivery and never reaches the handler.
type QueuedJob = {
  type: keyof typeof deliveryRetries;
  delaySeconds?: number;
  [id: string]: string | number | undefined;
};

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
        jobs.map(({ type, delaySeconds, ...ids }) => ({
          url: qstashJobUrl(appUrl, type),
          body: ids,
          retries: deliveryRetries[type],
          ...(retryDelays[type] ? { retryDelay: retryDelays[type] } : {}),
          ...(delaySeconds ? { delay: delaySeconds } : {}),
          ...(type === "process-inbox-event"
            ? { failureCallback: qstashJobUrl(appUrl, "inbox-event-failed") }
            : {}),
          // QStash accepts only letters, digits, "-", "_" and "." in a key and
          // refuses the whole batch otherwise.
          ...(type === "run-bot-turn"
            ? { flowControl: { key: `bot-${ids.conversationId}`, parallelism: 1 } }
            : {}),
        })),
      );
      if (published.length !== jobs.length || published.some((result) => !result?.messageId)) {
        throw new Error("QStash did not accept every job");
      }
    },
  };
};

// How often the sweep runs (ADR 0007). Every 30 minutes, not 5, so Neon's
// compute can suspend between runs: it suspends after 5 minutes without
// queries, so a five-minute sweep kept it running all month. Must divide 60.
export const sweepIntervalMinutes = 30;
export const sweepIntervalMs = sweepIntervalMinutes * 60_000;

// Creates or updates the QStash schedule that calls the sweep (ADR 0007).
// The fixed id makes it safe to run again. A failed run is not retried: the
// next one is one interval away.
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
    cron: `*/${sweepIntervalMinutes} * * * *`,
    retries: 0,
  });
};

// QStash's cloud cannot call a local APP_URL; a local QStash dev server can.
export const isLocalUrl = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(new URL(url).hostname);

// Reads the sweep's schedule without changing it, or null when it does not
// exist (#182).
export const readSweepSchedule = async ({ token, baseUrl }: { token: string; baseUrl: string }) => {
  const client = new Client({ token, baseUrl, devMode: false, enableTelemetry: false });
  try {
    const schedule = await client.schedules.get("sweep");
    return { destination: schedule.destination, paused: schedule.isPaused };
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) return null;
    throw error;
  }
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
