import { z } from "zod";
import { answerSubscriptionChallenge, type WebhookInbox } from "@/modules/webhook-inbox";

type JobVerifier = {
  verify(request: { signature: string | null; body: string; url: string }): Promise<boolean>;
};

const empty = (status: number) => new Response(null, { status });

const receiveStatus = { invalid_signature: 401, invalid_payload: 400, enqueue_failed: 500 } as const;

// Request adapters only. Failures are logged without detail: database errors
// can echo event content, and logs must never carry message text or phones.
export const createWhatsAppWebhookRoute = (
  config: { inbox: WebhookInbox; verifyToken: string } | null,
) => ({
  GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const challenge = config && answerSubscriptionChallenge({
      mode: params.get("hub.mode"),
      token: params.get("hub.verify_token"),
      challenge: params.get("hub.challenge"),
    }, config.verifyToken);
    return challenge
      ? new Response(challenge, { headers: { "content-type": "text/plain; charset=utf-8" } })
      : empty(403);
  },

  async POST(request: Request) {
    if (!config) return empty(503);
    try {
      const result = await config.inbox.receive({
        body: await request.text(),
        signature: request.headers.get("x-hub-signature-256"),
      });
      // Anything but 200 makes Meta redeliver, which recovers a failed enqueue.
      return empty(result.ok ? 200 : receiveStatus[result.error]);
    } catch {
      console.error("WhatsApp webhook delivery could not be stored");
      return empty(500);
    }
  },
});

const inboxJobSchema = z.strictObject({ inboxEventId: z.string().min(1).max(64) });

export const createInboxJobRoute = (
  config: { inbox: WebhookInbox; verifier: JobVerifier; url: string } | null,
) => ({
  async POST(request: Request) {
    if (!config) return empty(503);
    try {
      const body = await request.text();
      const signature = request.headers.get("upstash-signature");
      if (!await config.verifier.verify({ signature, body, url: config.url })) return empty(401);
      const job = inboxJobSchema.safeParse(JSON.parse(body));
      if (!job.success) return empty(400);
      // An event pruned since it was enqueued needs no retry.
      await config.inbox.process(job.data.inboxEventId);
      return empty(200);
    } catch (error) {
      if (error instanceof SyntaxError) return empty(400);
      // QStash retries the job; repeated failures reach its dead-letter queue.
      console.error("Inbox event processing failed");
      return empty(500);
    }
  },
});
