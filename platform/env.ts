import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { isUsSentryDsn } from "@/platform/diagnostics";

export const env = createEnv({
  /*
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(1),
    APP_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    // Verified Resend sender, e.g. "ClickStudio Bots <convites@example.com>".
    EMAIL_FROM: z.string().min(1),
    ABLY_API_KEY: z.string().min(1).optional(),
    META_APP_ID: z.string().regex(/^\d+$/).optional(),
    META_APP_SECRET: z.string().min(1).optional(),
    META_WHATSAPP_SIGNUP_CONFIG_ID: z.string().regex(/^\d+$/).optional(),
    META_GRAPH_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default("v26.0"),
    WHATSAPP_TOKEN_KEY_VERSION: z.string().min(1).optional(),
    WHATSAPP_TOKEN_KEYS: z.string().min(1).optional(),
    // The token Meta echoes in the webhook verification handshake.
    META_WEBHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
    // QStash's US East region, beside Vercel iad1 and Neon us-east. Tokens
    // and signing keys are per region, so they must come from this one.
    QSTASH_URL: z.url().default("https://qstash-us-east-1.upstash.io"),
    QSTASH_TOKEN: z.string().min(1).optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
    SENTRY_DSN: z.url().refine(isUsSentryDsn, "Sentry requires a US project DSN").optional(),
    CRON_SECRET: z.string().min(16).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    AI_MODEL_ID: z.string().trim().min(1).optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    APP_URL: process.env.APP_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    ABLY_API_KEY: process.env.ABLY_API_KEY,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_WHATSAPP_SIGNUP_CONFIG_ID: process.env.META_WHATSAPP_SIGNUP_CONFIG_ID,
    META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
    WHATSAPP_TOKEN_KEY_VERSION: process.env.WHATSAPP_TOKEN_KEY_VERSION,
    WHATSAPP_TOKEN_KEYS: process.env.WHATSAPP_TOKEN_KEYS,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    CRON_SECRET: process.env.CRON_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    AI_MODEL_ID: process.env.AI_MODEL_ID,
  },
});
