import type {
  EncryptedWhatsAppToken,
  WhatsAppCredentialContext,
} from "@/platform/whatsapp-credentials";

// Plaintext access tokens never cross this port.
export interface WhatsAppGateway {
  exchangeSignup(input: {
    tenantId: string;
    code: string;
    wabaId: string;
    phoneNumberId?: string;
  }): Promise<{
    phoneNumberId: string;
    displayPhoneNumber: string;
    credential: EncryptedWhatsAppToken;
  }>;
  subscribe(
    input: WhatsAppCredentialContext & { credential: EncryptedWhatsAppToken },
  ): Promise<{ ok: true } | { ok: false; error: "missing_webhook_fields" | "subscription_failed" }>;
  // Asks Meta to deliver the app's contacts or message history as webhooks.
  // Meta accepts each only once per onboarding.
  requestAppSync(
    input: WhatsAppCredentialContext & {
      credential: EncryptedWhatsAppToken;
      syncType: "smb_app_state_sync" | "history";
    },
  ): Promise<{ ok: boolean }>;
}
