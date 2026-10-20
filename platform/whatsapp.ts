import { z } from "zod";
import {
  createWhatsAppTokenCipher,
  type EncryptedWhatsAppToken,
  type WhatsAppCredentialContext,
} from "@/platform/whatsapp-credentials";

// Delivery statuses arrive under `messages`; there is no `statuses` field.
export const whatsAppWebhookFields = [
  "messages", "account_update", "smb_message_echoes", "history", "smb_app_state_sync",
] as const;

type Options = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  activeKeyVersion: string;
  encryptionKeys: Record<string, string>;
  fetch?: (url: string | URL, init?: RequestInit) => Promise<Response>;
};

const phoneSchema = z.object({
  id: z.string().regex(/^\d+$/),
  display_phone_number: z.string().min(1),
  is_on_biz_app: z.boolean(),
  platform_type: z.string(),
});

export const createWhatsAppAdapter = (options: Options) => {
  const cipher = createWhatsAppTokenCipher(options.activeKeyVersion, options.encryptionKeys);
  const http = options.fetch ?? globalThis.fetch;
  const baseUrl = `https://graph.facebook.com/${options.graphVersion}`;

  const request = async (path: string, init: RequestInit): Promise<unknown> => {
    try {
      const response = await http(`${baseUrl}/${path}`, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      // Never propagate a vendor body, URL, header, token or transport error.
      throw new Error("WhatsApp request failed");
    }
  };

  return {
    async exchangeSignup(input: { tenantId: string; code: string; wabaId: string; phoneNumberId?: string }) {
      try {
        const result = await request("oauth/access_token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: options.appId,
            client_secret: options.appSecret,
            code: input.code,
          }),
        });
        const { access_token: token } = z.object({ access_token: z.string().min(1) }).parse(result);
        // The browser's asset ids are hints. Meta must authorize the WABA and
        // confirm that the selected phone is registered for coexistence.
        const phones = z.object({ data: z.array(phoneSchema) }).parse(await request(
          `${input.wabaId}/phone_numbers?fields=id,display_phone_number,is_on_biz_app,platform_type&limit=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        ));
        const candidates = phones.data.filter((phone) =>
          phone.is_on_biz_app && phone.platform_type === "CLOUD_API" &&
          (!input.phoneNumberId || phone.id === input.phoneNumberId));
        if (candidates.length !== 1) throw new Error();
        const phone = candidates[0];
        const context = { tenantId: input.tenantId, wabaId: input.wabaId, phoneNumberId: phone.id };
        return {
          phoneNumberId: phone.id,
          displayPhoneNumber: phone.display_phone_number,
          credential: cipher.encrypt(token, context),
        };
      } catch {
        throw new Error("WhatsApp signup failed");
      }
    },

    async subscribe(input: WhatsAppCredentialContext & { credential: EncryptedWhatsAppToken }) {
      try {
        // WABA subscriptions inherit the app's configured fields. Verify those
        // fields rather than claiming that subscribed_apps configures them.
        const appSubscriptions = z.object({
          data: z.array(z.object({
            object: z.string(),
            active: z.boolean(),
            fields: z.array(z.union([z.string(), z.object({ name: z.string() })])),
          })),
        }).parse(await request(`${options.appId}/subscriptions`, {
          headers: { Authorization: `Bearer ${options.appId}|${options.appSecret}` },
        }));
        const fields = new Set(appSubscriptions.data
          .filter((subscription) => subscription.object === "whatsapp_business_account" && subscription.active)
          .flatMap((subscription) => subscription.fields.map((field) =>
            typeof field === "string" ? field : field.name)));
        if (!whatsAppWebhookFields.every((field) => fields.has(field))) {
          return { ok: false as const, error: "missing_webhook_fields" as const };
        }
        const result = await request(`${input.wabaId}/subscribed_apps`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cipher.decrypt(input.credential, input)}` },
        });
        if (!z.object({ success: z.literal(true) }).safeParse(result).success) {
          throw new Error();
        }
        return { ok: true as const };
      } catch {
        return { ok: false as const, error: "subscription_failed" as const };
      }
    },
  };
};
