import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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
    META_APP_ID: z.string().regex(/^\d+$/).optional(),
    META_APP_SECRET: z.string().min(1).optional(),
    META_WHATSAPP_SIGNUP_CONFIG_ID: z.string().regex(/^\d+$/).optional(),
    META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
    WHATSAPP_TOKEN_KEY_VERSION: z.string().min(1).optional(),
    WHATSAPP_TOKEN_KEYS: z.string().min(1).optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    APP_URL: process.env.APP_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_WHATSAPP_SIGNUP_CONFIG_ID: process.env.META_WHATSAPP_SIGNUP_CONFIG_ID,
    META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
    WHATSAPP_TOKEN_KEY_VERSION: process.env.WHATSAPP_TOKEN_KEY_VERSION,
    WHATSAPP_TOKEN_KEYS: process.env.WHATSAPP_TOKEN_KEYS,
  },
});
