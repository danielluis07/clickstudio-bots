import type { EncryptedWhatsAppToken, WhatsAppCredentialContext } from "@/platform/whatsapp-credentials";

// Sends from a Channel through the Cloud API. Plaintext access tokens never
// cross this port; the adapter decrypts the credential itself.
export interface WhatsAppSender {
  sendText(input: WhatsAppCredentialContext & {
    credential: EncryptedWhatsAppToken;
    // The Contact's wa_id.
    to: string;
    text: string;
  }): Promise<{ wamid: string }>;
}
