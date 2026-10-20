import { z } from "zod";

export type EmbeddedSignupConfig = {
  appId: string;
  configId: string;
  graphVersion: string;
};

type LoginResponse = { authResponse?: { code?: string } };

export type FacebookSdk = {
  init(options: { appId: string; version: string; autoLogAppEvents: boolean; xfbml: boolean }): void;
  login(callback: (response: LoginResponse) => void, options: {
    config_id: string;
    response_type: "code";
    override_default_response_type: true;
    extras: { setup: Record<string, never>; featureType: "whatsapp_business_app_onboarding"; sessionInfoVersion: "3" };
  }): void;
};

declare global {
  interface Window { FB?: FacebookSdk }
}

const sessionSchema = z.object({
  type: z.literal("WA_EMBEDDED_SIGNUP"),
  event: z.string(),
  data: z.object({
    waba_id: z.string().regex(/^\d+$/).optional(),
    phone_number_id: z.string().regex(/^\d+$/).optional(),
  }).optional(),
});

const trustedOrigins = new Set(["https://www.facebook.com", "https://web.facebook.com", "https://facebook.com"]);

export const parseSignupSession = (event: MessageEvent) => {
  if (!trustedOrigins.has(event.origin)) return null;
  try {
    const parsed = sessionSchema.safeParse(typeof event.data === "string" ? JSON.parse(event.data) : event.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
