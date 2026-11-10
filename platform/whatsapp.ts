import { z } from "zod";
import {
  createWhatsAppTokenCipher,
  type EncryptedWhatsAppToken,
  type WhatsAppCredentialContext,
} from "@/platform/whatsapp-credentials";
import { logError } from "@/platform/diagnostics";

// Delivery statuses arrive under `messages`; there is no `statuses` field.
export const whatsAppWebhookFields = [
  "messages",
  "account_update",
  "smb_message_echoes",
  "history",
  "smb_app_state_sync",
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

// A failed Graph API call. It keeps only Meta's diagnostic codes: never the
// vendor body, URL, header, token or a transport error's message.
export class WhatsAppRequestError extends Error {
  override name = "WhatsAppRequestError";
  constructor(
    readonly httpStatus?: number,
    readonly metaCode?: number,
    readonly metaSubcode?: number,
    readonly fbtraceId?: string,
    options?: ErrorOptions,
  ) {
    super("WhatsApp request failed", options);
  }
}

const metaErrorSchema = z.object({
  error: z.object({
    code: z.number().int().optional().catch(undefined),
    error_subcode: z.number().int().optional().catch(undefined),
    fbtrace_id: z.string().optional().catch(undefined),
  }),
});

const readMetaError = async (response: Response) => {
  // Only the error's codes are kept; the message may echo the request.
  const parsed = metaErrorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error : {};
};

// Every failed call is recorded here, as an expected failure that does not
// alert, so callers may answer "unavailable" and discard the error.
// Takes only the Tenant id from the call's input, never the text or phone.
const recordFailure = (operation: string, error: unknown, { tenantId }: { tenantId?: string }) =>
  logError("meta_request_failed", error, { tenantId, operation });

export const createWhatsAppAdapter = (options: Options) => {
  const cipher = createWhatsAppTokenCipher(options.activeKeyVersion, options.encryptionKeys);
  const http = options.fetch ?? globalThis.fetch;
  const baseUrl = `https://graph.facebook.com/${options.graphVersion}`;

  const request = async (path: string, init: RequestInit): Promise<unknown> => {
    let response: Response;
    try {
      response = await http(`${baseUrl}/${path}`, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      // The cause's class (TimeoutError, TypeError) is recorded, not its message.
      throw new WhatsAppRequestError(undefined, undefined, undefined, undefined, { cause: error });
    }
    if (!response.ok) {
      const meta = await readMetaError(response);
      throw new WhatsAppRequestError(
        response.status,
        meta.code,
        meta.error_subcode,
        meta.fbtrace_id ?? response.headers.get("x-fb-trace-id") ?? undefined,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new WhatsAppRequestError(response.status, undefined, undefined, undefined, {
        cause: error,
      });
    }
  };

  return {
    async exchangeSignup(input: {
      tenantId: string;
      code: string;
      wabaId: string;
      phoneNumberId?: string;
    }) {
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
        const phones = z
          .object({ data: z.array(phoneSchema) })
          .parse(
            await request(
              `${input.wabaId}/phone_numbers?fields=id,display_phone_number,is_on_biz_app,platform_type&limit=100`,
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
        const candidates = phones.data.filter(
          (phone) =>
            phone.is_on_biz_app &&
            phone.platform_type === "CLOUD_API" &&
            (!input.phoneNumberId || phone.id === input.phoneNumberId),
        );
        if (candidates.length !== 1) throw new Error();
        const phone = candidates[0];
        const context = { tenantId: input.tenantId, wabaId: input.wabaId, phoneNumberId: phone.id };
        return {
          phoneNumberId: phone.id,
          displayPhoneNumber: phone.display_phone_number,
          credential: cipher.encrypt(token, context),
        };
      } catch (error) {
        recordFailure("exchangeSignup", error, { tenantId: input.tenantId });
        throw new Error("WhatsApp signup failed", { cause: error });
      }
    },

    async subscribe(input: WhatsAppCredentialContext & { credential: EncryptedWhatsAppToken }) {
      try {
        // WABA subscriptions inherit the app's configured fields. Verify those
        // fields rather than claiming that subscribed_apps configures them.
        const appSubscriptions = z
          .object({
            data: z.array(
              z.object({
                object: z.string(),
                active: z.boolean(),
                fields: z.array(z.union([z.string(), z.object({ name: z.string() })])),
              }),
            ),
          })
          .parse(
            await request(`${options.appId}/subscriptions`, {
              headers: { Authorization: `Bearer ${options.appId}|${options.appSecret}` },
            }),
          );
        const fields = new Set(
          appSubscriptions.data
            .filter(
              (subscription) =>
                subscription.object === "whatsapp_business_account" && subscription.active,
            )
            .flatMap((subscription) =>
              subscription.fields.map((field) => (typeof field === "string" ? field : field.name)),
            ),
        );
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
      } catch (error) {
        recordFailure("subscribe", error, input);
        return { ok: false as const, error: "subscription_failed" as const };
      }
    },

    async unsubscribe(input: WhatsAppCredentialContext & { credential: EncryptedWhatsAppToken }) {
      try {
        const result = await request(`${input.wabaId}/subscribed_apps`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cipher.decrypt(input.credential, input)}` },
        });
        return { ok: z.object({ success: z.literal(true) }).safeParse(result).success };
      } catch (error) {
        recordFailure("unsubscribe", error, input);
        return { ok: false };
      }
    },

    async requestAppSync(
      input: WhatsAppCredentialContext & {
        credential: EncryptedWhatsAppToken;
        syncType: "smb_app_state_sync" | "history";
      },
    ) {
      try {
        const result = await request(`${input.phoneNumberId}/smb_app_data`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cipher.decrypt(input.credential, input)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messaging_product: "whatsapp", sync_type: input.syncType }),
        });
        // Acceptance only; whether the business shares its history arrives later.
        return { ok: z.object({ request_id: z.string().min(1) }).safeParse(result).success };
      } catch (error) {
        recordFailure("requestAppSync", error, input);
        return { ok: false };
      }
    },

    async sendText(
      input: WhatsAppCredentialContext & {
        credential: EncryptedWhatsAppToken;
        to: string;
        text: string;
      },
    ) {
      try {
        const token = cipher.decrypt(input.credential, input);
        const result = await request(`${input.phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.to,
            type: "text",
            text: { body: input.text, preview_url: false },
          }),
        });
        const {
          messages: [sent],
        } = z.object({ messages: z.tuple([z.object({ id: z.string().min(1) })]) }).parse(result);
        return { wamid: sent.id };
      } catch (error) {
        recordFailure("sendText", error, input);
        throw new Error("WhatsApp send failed", { cause: error });
      }
    },
  };
};
