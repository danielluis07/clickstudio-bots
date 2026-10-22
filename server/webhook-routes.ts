import { z } from "zod";
import {
  answerSubscriptionChallenge,
  type InboxDiagnostics,
  type WebhookInbox,
} from "@/modules/webhook-inbox";
import { classifyError } from "@/platform/diagnostics";

type JobVerifier = {
  verify(request: { signature: string | null; body: string; url: string }): Promise<boolean>;
};

const empty = (status: number) => new Response(null, { status });

const receiveStatus = {
  invalid_signature: 401,
  invalid_payload: 400,
  enqueue_failed: 500,
} as const;

// Request adapters only. Failures are logged without detail: database errors
// can echo event content, and logs must never carry message text or phones.
// Each half works without the other: Meta's handshake needs only the token.
export const createWhatsAppWebhookRoute = ({
  inbox,
  verifyToken,
}: {
  inbox: WebhookInbox | null;
  verifyToken: string | null;
}) => ({
  GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const challenge =
      verifyToken &&
      answerSubscriptionChallenge(
        {
          mode: params.get("hub.mode"),
          token: params.get("hub.verify_token"),
          challenge: params.get("hub.challenge"),
        },
        verifyToken,
      );
    return challenge
      ? new Response(challenge, { headers: { "content-type": "text/plain; charset=utf-8" } })
      : empty(403);
  },

  async POST(request: Request) {
    if (!inbox) return empty(503);
    try {
      const result = await inbox.receive({
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
const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

export const createInboxJobRoute = (
  config: { inbox: WebhookInbox; verifier: JobVerifier; url: string } | null,
  diagnostics?: Pick<InboxDiagnostics, "log">,
) => ({
  async POST(request: Request) {
    if (!config) return empty(503);
    let inboxEventId: string | undefined;
    try {
      const body = await request.text();
      const signature = request.headers.get("upstash-signature");
      if (!(await config.verifier.verify({ signature, body, url: config.url }))) return empty(401);
      const job = inboxJobSchema.safeParse(parseJson(body));
      if (!job.success) return empty(400);
      inboxEventId = job.data.inboxEventId;
      // An event pruned since it was enqueued needs no retry.
      await config.inbox.process(inboxEventId);
      return empty(200);
    } catch (error) {
      // QStash retries the job; repeated failures reach its dead-letter queue.
      diagnostics?.log({
        kind: "inbox_processing_failed",
        inboxEventId,
        errorClass: classifyError(error),
      });
      return empty(500);
    }
  },
});

const failureSchema = z.object({
  status: z.number().int().min(400).max(599),
  sourceMessageId: z.string().regex(/^msg_[a-zA-Z0-9_-]{1,128}$/),
  sourceBody: z.string().max(2048),
  url: z.url(),
});

export const createInboxFailureRoute = (
  config: { inbox: WebhookInbox; verifier: JobVerifier; url: string; sourceUrl: string } | null,
) => ({
  async POST(request: Request) {
    if (!config) return empty(503);
    try {
      const body = await request.text();
      if (
        !(await config.verifier.verify({
          signature: request.headers.get("upstash-signature"),
          body,
          url: config.url,
        }))
      )
        return empty(401);
      const callback = failureSchema.safeParse(parseJson(body));
      if (!callback.success || callback.data.url !== config.sourceUrl) return empty(400);
      const job = inboxJobSchema.safeParse(
        parseJson(Buffer.from(callback.data.sourceBody, "base64").toString("utf8")),
      );
      if (!job.success) return empty(400);
      // Ignore response bodies, headers and caller IP; only the source job's ID
      // is needed. Duplicate callbacks and already-settled events are no-ops.
      await config.inbox.fail(job.data.inboxEventId, callback.data.sourceMessageId);
      return empty(200);
    } catch {
      return empty(500);
    }
  },
});
