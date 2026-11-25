import { z } from "zod";
import type { LiveBot } from "@/modules/bot";
import { reportError, type Diagnostics } from "@/platform/diagnostics";
import { readVerifiedBody, type QStashVerifier } from "@/server/qstash-verification";

const jobSchema = z.strictObject({ conversationId: z.string().min(1).max(64) });

// QStash counts the deliveries it already retried. Without a readable count
// the attempt is undefined, which the Bot treats as the last.
const attemptOf = (request: Request) => {
  const retried = request.headers.get("upstash-retried");
  return retried && /^\d{1,3}$/.test(retried) ? Number(retried) + 1 : undefined;
};

export const createBotJobRoute = (
  config: {
    bot: LiveBot;
    url: string;
    verifier: QStashVerifier;
  } | null,
  diagnostics?: Diagnostics,
) => ({
  async POST(request: Request) {
    if (!config) return new Response(null, { status: 503 });
    let conversationId: string | undefined;
    try {
      const body = await readVerifiedBody(request, config);
      if (body === null) return new Response(null, { status: 401 });
      let input: unknown;
      try {
        input = JSON.parse(body);
      } catch {
        // A malformed job is refused, not a failure.
        return new Response(null, { status: 400 });
      }
      const parsed = jobSchema.safeParse(input);
      if (!parsed.success) return new Response(null, { status: 400 });
      conversationId = parsed.data.conversationId;
      const result = await config.bot.run(conversationId, { attempt: attemptOf(request) });
      // A crashed holder's lease needs time to expire; acknowledge only after
      // a worker actually acquires it, so QStash retries contention. A
      // transient Model failure is retried the same way, without an alert.
      return new Response(null, { status: result === "busy" || result === "retry" ? 503 : 200 });
    } catch (error) {
      // The Bot's expected failures (Model, Meta) settle inside the turn; one
      // that reaches the job is unexpected. The Tenant id comes with the error.
      await reportError(diagnostics, "bot_job_failed", error, { conversationId });
      return new Response(null, { status: 500 });
    }
  },
});
