import { createHmac } from "node:crypto";

// Synthetic Meta webhook deliveries. Never commit real Contact payloads.

export const metaAppSecret = "test-app-secret";

export const signMetaDelivery = (body: string, secret = metaAppSecret) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

type Metadata = { phoneNumberId: string };

export const textMessageChange = ({
  phoneNumberId,
  wamid,
  from = "5511988887777",
  name = "Maria Teste",
  body = "Olá, vocês abrem sábado?",
  timestamp = "1792497600",
}: Metadata & {
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

export const mediaMessageChange = ({
  type,
  caption,
  duration,
  ...input
}: Parameters<typeof textMessageChange>[0] & {
  type: string;
  caption?: string;
  duration?: number;
}) => {
  const change = textMessageChange(input);
  const [original] = change.value.messages;
  return {
    ...change,
    value: {
      ...change.value,
      messages: [
        {
          from: original.from,
          id: original.id,
          timestamp: original.timestamp,
          type,
          [type]: {
            id: "synthetic-media-id",
            mime_type: "application/octet-stream",
            sha256: "synthetic-media-hash",
            caption,
            duration,
            voice: type === "audio",
          },
        },
      ],
    },
  };
};

export const statusChange = ({
  phoneNumberId,
  wamid,
  status,
  timestamp = "1792497700",
}: Metadata & {
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
export const referencingChange = ({
  phoneNumberId,
  wamid,
  originalWamid = wamid,
  type,
  by = "contact",
  body = "Olá, editado",
  timestamp = "1792497900",
}: Metadata & {
  wamid: string;
  originalWamid?: string;
  type: "edit" | "revoke";
  by?: "contact" | "app";
  body?: string;
  timestamp?: string;
}) => {
  const event = {
    id: wamid,
    timestamp,
    type,
    [type]:
      type === "edit"
        ? { original_message_id: originalWamid, message: { type: "text", text: { body } } }
        : { original_message_id: originalWamid },
  };
  const metadata = { display_phone_number: "5511999990000", phone_number_id: phoneNumberId };
  return by === "contact"
    ? {
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata,
          messages: [{ from: "5511988887777", ...event }],
        },
      }
    : {
        field: "smb_message_echoes",
        value: {
          messaging_product: "whatsapp",
          metadata,
          message_echoes: [{ from: "5511999990000", to: "5511988887777", ...event }],
        },
      };
};

// The Contact's reaction to an earlier message; an empty emoji removes it.
export const reactionChange = ({
  phoneNumberId,
  wamid,
  reactedWamid,
  from = "5511988887777",
  emoji = "👍",
  timestamp = "1792497900",
}: Metadata & {
  wamid: string;
  reactedWamid: string;
  from?: string;
  emoji?: string;
  timestamp?: string;
}) => ({
  field: "messages",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    contacts: [{ profile: { name: "Maria Teste" }, wa_id: from }],
    messages: [
      {
        from,
        id: wamid,
        timestamp,
        type: "reaction",
        reaction: { message_id: reactedWamid, emoji },
      },
    ],
  },
});

// A message the business sent from the WhatsApp Business app or a companion
// device, echoed to the platform through coexistence.
export const messageEchoChange = ({
  phoneNumberId,
  wamid,
  to = "5511988887777",
  body = "Abrimos sim, das 9h às 13h.",
  timestamp = "1792497800",
}: Metadata & {
  wamid: string;
  to?: string;
  body?: string;
  timestamp?: string;
}) => ({
  field: "smb_message_echoes",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    message_echoes: [
      { from: "5511999990000", to, id: wamid, timestamp, type: "text", text: { body } },
    ],
  },
});

export const metaDelivery = (...changes: { field: string; value: unknown }[]) =>
  JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "200", changes }] });

type HistoryMessage = {
  wamid: string;
  // The Contact's wa_id for their messages, the business number otherwise.
  from: string;
  timestamp: string;
  body?: string;
  type?: string;
  status?: "SENT" | "DELIVERED" | "READ" | "PLAYED" | "ERROR" | "PENDING";
  groupId?: string;
};

// One chunk of the WhatsApp Business app's history, shared after onboarding.
export const historyChange = ({
  phoneNumberId,
  phase = 0,
  chunkOrder = 1,
  progress = 100,
  threads,
}: Metadata & {
  phase?: 0 | 1 | 2;
  chunkOrder?: number;
  progress?: number;
  threads: { id: string; messages: HistoryMessage[] }[];
}) => ({
  field: "history",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    history: [
      {
        metadata: { phase, chunk_order: chunkOrder, progress },
        threads: threads.map(({ id, messages }) => ({
          id,
          messages: messages.map(
            ({
              wamid,
              from,
              timestamp,
              body = "Mensagem antiga",
              type = "text",
              status = "READ",
              groupId,
            }) => ({
              from,
              ...(from === id ? {} : { to: id }),
              id: wamid,
              timestamp,
              type,
              ...(type === "text" ? { text: { body } } : {}),
              ...(groupId ? { group_id: groupId } : {}),
              history_context: { status },
            }),
          ),
        })),
      },
    ],
  },
});

// The business turned history sharing off in the WhatsApp Business app.
export const historyDeclinedChange = ({
  phoneNumberId,
  code = 2593109,
}: Metadata & { code?: number }) => ({
  field: "history",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    history: [
      {
        errors: [
          {
            code,
            title: "History sync is turned off by the business from the WhatsApp Business App",
            message: "History sync is turned off by the business from the WhatsApp Business App",
            error_data: {
              details: "History sync is turned off by the business from the WhatsApp Business App",
            },
          },
        ],
      },
    ],
  },
});

// Contacts saved in the WhatsApp Business app, added, edited or removed.
export const contactSyncChange = ({
  phoneNumberId,
  contacts,
}: Metadata & {
  contacts: {
    phone: string;
    fullName?: string;
    firstName?: string;
    action?: "add" | "remove";
    timestamp?: string;
  }[];
}) => ({
  field: "smb_app_state_sync",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511999990000", phone_number_id: phoneNumberId },
    state_sync: contacts.map(
      ({ phone, fullName, firstName, action = "add", timestamp = "1792497600" }) => ({
        type: "contact",
        contact:
          action === "add"
            ? {
                full_name: fullName,
                first_name: firstName ?? fullName?.split(" ")[0],
                phone_number: phone,
              }
            : { phone_number: phone },
        action,
        metadata: { timestamp },
      }),
    ),
  },
});
