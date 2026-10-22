import { z } from "zod";
import type { LiveBot } from "@/modules/bot";

const jobSchema = z.strictObject({ conversationId: z.string().min(1).max(64) });

export const createBotJobRoute = (
  config: {
    bot: LiveBot;
    url: string;
    verifier: {
      verify(input: { signature: string | null; body: string; url: string }): Promise<boolean>;
    };
  } | null,
) => ({
  async POST(request: Request) {
    if (!config) return new Response(null, { status: 503 });
    try {
      const body = await request.text();
      if (
        !(await config.verifier.verify({
          body,
          signature: request.headers.get("upstash-signature"),
          url: config.url,
        }))
      )
        return new Response(null, { status: 401 });
      let input: unknown;
      try {
        input = JSON.parse(body);
      } catch {
        return new Response(null, { status: 400 });
      }
      const parsed = jobSchema.safeParse(input);
      if (!parsed.success) return new Response(null, { status: 400 });
      const result = await config.bot.run(parsed.data.conversationId);
      // A crashed holder's lease needs time to expire; acknowledge only after
      // a worker actually acquires it, so QStash retries contention.
      return new Response(null, { status: result === "busy" ? 503 : 200 });
    } catch {
      console.error("Bot turn job failed");
      return new Response(null, { status: 500 });
    }
  },
});
