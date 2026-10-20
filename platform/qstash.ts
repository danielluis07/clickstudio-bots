import { Client, Receiver } from "@upstash/qstash";

// A job is its type plus ids; the type names the route that handles it.
type QueuedJob = { type: string } & Record<string, string>;

export const createQStashJobQueue = ({ token, baseUrl, appUrl }: {
  token: string;
  baseUrl: string;
  appUrl: string;
}) => {
  // Few, quick retries: the webhook must answer Meta promptly, and an
  // unacknowledged delivery is redelivered by Meta anyway.
  const client = new Client({ token, baseUrl, devMode: false, enableTelemetry: false, retry: { retries: 2 } });
  return {
    async enqueue(jobs: readonly QueuedJob[]) {
      if (jobs.length === 0) return;
      const published = await client.batchJSON(jobs.map(({ type, ...ids }) => ({
        url: new URL(`/api/jobs/${type}`, appUrl).toString(),
        body: ids,
      })));
      if (published.length !== jobs.length || published.some((result) => !result?.messageId)) {
        throw new Error("QStash did not accept every job");
      }
    },
  };
};

export const createQStashJobVerifier = (keys: { currentSigningKey: string; nextSigningKey: string }) => {
  const receiver = new Receiver({ ...keys, devMode: false });
  return {
    // `url` is the endpoint QStash was asked to call; a token signed for any
    // other endpoint, or another body, is rejected.
    async verify({ signature, body, url }: { signature: string | null; body: string; url: string }) {
      if (!signature) return false;
      return receiver.verify({ signature, body, url }).catch(() => false);
    },
  };
};
