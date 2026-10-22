import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const encryptedTokenSchema = z.object({
  keyVersion: z.string().min(1),
  iv: z.string(),
  ciphertext: z.string(),
  tag: z.string(),
});

export type EncryptedWhatsAppToken = z.infer<typeof encryptedTokenSchema>;

export type WhatsAppCredentialContext = {
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
};

// Used only at the WhatsApp adapter boundary. Binding the ciphertext to the
// Channel prevents a stored credential being transplanted to another Tenant.
export const createWhatsAppTokenCipher = (
  activeKeyVersion: string,
  encryptionKeys: Record<string, string>,
) => {
  const keys = new Map(
    Object.entries(encryptionKeys).map(([version, value]) => {
      const key = Buffer.from(value, "base64");
      if (key.length !== 32 || key.toString("base64") !== value) {
        throw new Error("Invalid WhatsApp encryption key configuration");
      }
      return [version, key] as const;
    }),
  );
  if (!keys.has(activeKeyVersion)) {
    throw new Error("Missing active WhatsApp encryption key");
  }
  const aad = (context: WhatsAppCredentialContext, version: string) =>
    Buffer.from(JSON.stringify([context.tenantId, context.wabaId, context.phoneNumberId, version]));

  return {
    encrypt(token: string, context: WhatsAppCredentialContext): EncryptedWhatsAppToken {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", keys.get(activeKeyVersion)!, iv);
      cipher.setAAD(aad(context, activeKeyVersion));
      const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
      return {
        keyVersion: activeKeyVersion,
        iv: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      };
    },
    decrypt(value: EncryptedWhatsAppToken, context: WhatsAppCredentialContext) {
      const encrypted = encryptedTokenSchema.parse(value);
      const key = keys.get(encrypted.keyVersion);
      if (!key) throw new Error("Unknown WhatsApp encryption key version");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
      decipher.setAAD(aad(context, encrypted.keyVersion));
      decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
};
