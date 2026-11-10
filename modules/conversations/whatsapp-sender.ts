import type {
  EncryptedWhatsAppToken,
  WhatsAppCredentialContext,
} from "@/platform/whatsapp-credentials";

// Sends from a Channel through the Cloud API. Plaintext access tokens never
// cross this port; the adapter decrypts the credential itself. `sendText`
// rejects with a `RetryableError` (`@/platform/retryable`) only when Meta
// refused the message and may accept it later, and with a
// `CredentialRejectedError` (`@/platform/whatsapp-credentials`) when Meta
// refused the Channel's credential; any other rejection may have been sent
// and must never be resent.
export interface WhatsAppSender {
  sendText(
    input: WhatsAppCredentialContext & {
      credential: EncryptedWhatsAppToken;
      // The Contact's wa_id.
      to: string;
      text: string;
    },
  ): Promise<{ wamid: string }>;
}
