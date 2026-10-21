import { createHmac } from "node:crypto";

// Synthetic Meta webhook deliveries. Never commit real Contact payloads.

export const metaAppSecret = "test-app-secret";

export const signMetaDelivery = (body: string, secret = metaAppSecret) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

type Metadata = { phoneNumberId: string };

export const textMessageChange = ({ phoneNumberId, wamid, from = "5511988887777", name = "Maria Teste", body = "Olá, vocês abrem sábado?", timestamp = "1792497600" }: Metadata & {
  wamid: string;
  from?: string;
  name?: string;
  body?: string;
  timestamp?: string;
}) => ({
  field: "messages",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id: wamid, timestamp, type: "text", text: { body } }],
  },
});

export const statusChange = ({ phoneNumberId, wamid, status, timestamp = "1792497700" }: Metadata & {
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
}) => ({
  field: "messages",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    statuses: [{ id: wamid, status, timestamp, recipient_id: "5511988887777" }],
  },
});

// Edits and revokes name the original message; Meta may reuse its wamid.
export const referencingChange = ({ phoneNumberId, wamid, type, from = "5511988887777" }: Metadata & {
  wamid: string;
  type: "edit" | "revoke";
  from?: string;
}) => ({
  field: "messages",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    messages: [{
      from, id: wamid, timestamp: "1792497900", type,
      [type]: type === "edit"
        ? { original_message_id: wamid, message: { type: "text", text: { body: "Olá, editado" } } }
        : { original_message_id: wamid },
    }],
  },
});

export const metaDelivery =(...changes: { field: string; value: unknown }[]) =>
  JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "200", changes }] });
