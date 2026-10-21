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

// An edit or revoke of an earlier message, by the Contact or, echoed, by the
// business in the WhatsApp Business app. The event has its own wamid and names
// the original; it reuses the original's wamid unless told otherwise.
export const referencingChange = ({ phoneNumberId, wamid, originalWamid = wamid, type, by = "contact", body = "Olá, editado", timestamp = "1792497900" }: Metadata & {
  wamid: string;
  originalWamid?: string;
  type: "edit" | "revoke";
  by?: "contact" | "app";
  body?: string;
  timestamp?: string;
}) => {
  const event = {
    id: wamid, timestamp, type,
    [type]: type === "edit"
      ? { original_message_id: originalWamid, message: { type: "text", text: { body } } }
      : { original_message_id: originalWamid },
  };
  const metadata = { display_phone_number: "5511999990000", phone_number_id: phoneNumberId };
  return by === "contact"
    ? { field: "messages", value: { messaging_product: "whatsapp", metadata, messages: [{ from: "5511988887777", ...event }] } }
    : { field: "smb_message_echoes", value: { messaging_product: "whatsapp", metadata, message_echoes: [{ from: "5511999990000", to: "5511988887777", ...event }] } };
};

// A message the business sent from the WhatsApp Business app or a companion
// device, echoed to the platform through coexistence.
export const messageEchoChange = ({ phoneNumberId, wamid, to = "5511988887777", body = "Abrimos sim, das 9h às 13h.", timestamp = "1792497800" }: Metadata & {
  wamid: string;
  to?: string;
  body?: string;
  timestamp?: string;
}) => ({
  field: "smb_message_echoes",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    message_echoes: [{ from: "5511999990000", to, id: wamid, timestamp, type: "text", text: { body } }],
  },
});

export const metaDelivery =(...changes: { field: string; value: unknown }[]) =>
  JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "200", changes }] });
