import { z } from "zod";
import { logError } from "@/platform/diagnostics";
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

const buildWhatsAppAdapter = () => {
  if (!getWhatsAppSignupConfig()) throw new Error("WhatsApp is not configured");
  try {
    return createWhatsAppAdapter({
      appId: env.META_APP_ID!,
      appSecret: env.META_APP_SECRET!,
      graphVersion: env.META_GRAPH_API_VERSION,
      activeKeyVersion: env.WHATSAPP_TOKEN_KEY_VERSION!,
      encryptionKeys: z.record(z.string(), z.string()).parse(JSON.parse(env.WHATSAPP_TOKEN_KEYS!)),
    });
  } catch (error) {
    logError("whatsapp_configuration_invalid", error);
    throw error;
  }
};

// The environment never changes while the process runs, so the adapter, or
// the reason there is none, is settled on first use.
let built: { adapter: ReturnType<typeof createWhatsAppAdapter> } | { error: unknown } | undefined;

// Callers treat a throw as "WhatsApp unavailable" and discard it. Missing
// configuration is expected locally; configuration that is present but
// invalid (malformed keys) is recorded, or every send would fail unseen.
export const createWhatsAppGateway = () => {
  if (!built) {
    try {
      built = { adapter: buildWhatsAppAdapter() };
    } catch (error) {
      built = { error };
    }
  }
  if ("error" in built) throw built.error;
  return built.adapter;
};
