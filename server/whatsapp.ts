import { z } from "zod";
import { env } from "@/platform/env";
import { createWhatsAppAdapter } from "@/platform/whatsapp";

export const getWhatsAppSignupConfig = () => {
  if (
    !env.META_APP_ID ||
    !env.META_APP_SECRET ||
    !env.META_WHATSAPP_SIGNUP_CONFIG_ID ||
    !env.WHATSAPP_TOKEN_KEY_VERSION ||
    !env.WHATSAPP_TOKEN_KEYS
  )
    return null;
  // Only these public identifiers may enter the client component's props.
  return {
    appId: env.META_APP_ID,
    configId: env.META_WHATSAPP_SIGNUP_CONFIG_ID,
    graphVersion: env.META_GRAPH_API_VERSION,
  };
};

export const createWhatsAppGateway = () => {
  if (!getWhatsAppSignupConfig()) throw new Error("WhatsApp is not configured");
  return createWhatsAppAdapter({
    appId: env.META_APP_ID!,
    appSecret: env.META_APP_SECRET!,
    graphVersion: env.META_GRAPH_API_VERSION,
    activeKeyVersion: env.WHATSAPP_TOKEN_KEY_VERSION!,
    encryptionKeys: z.record(z.string(), z.string()).parse(JSON.parse(env.WHATSAPP_TOKEN_KEYS!)),
  });
};
