import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppContact, ImportedHistory, InboundTextMessage, MessageChange, MessageEcho, MessageStatusUpdate } from "@/modules/conversations";

export type InboxEventInput = {
  dedupeKey: string;
  field: string;
  phoneNumberId: string | null;
  // `{ wabaId, field, value }`: Meta's change, narrowed to this one event.
  payload: unknown;
};

const deliverySchema = z.object({
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) })),
  })),
});

// A history chunk holds many Contacts' threads; each becomes its own event,
// keeping the chunk's metadata.
const historyThreads = (item: unknown): unknown[] => {
  const parsed = z.looseObject({ threads: z.array(z.unknown()).min(1) }).safeParse(item);
  return parsed.success ? parsed.data.threads.map((thread) => ({ ...parsed.data, threads: [thread] })) : [item];
};

// Arrays that batch several events inside one change, per webhook field.
// Items of `byWamid` arrays are identified by their own wamid; a status only
// refers to a message, so many distinct statuses share one wamid. `split`
// divides an item further.
const eventArrays: Record<string, { key: string; byWamid: boolean; split?: (item: unknown) => unknown[] }[]> = {
  messages: [{ key: "messages", byWamid: true }, { key: "statuses", byWamid: false }],
  smb_message_echoes: [{ key: "message_echoes", byWamid: true }],
  history: [{ key: "history", byWamid: false, split: historyThreads }],
  smb_app_state_sync: [{ key: "state_sync", byWamid: false }],
};

// Edits and revokes are about another message; never let them collide with it.
const referencingTypes = new Set(["edit", "revoke"]);

const itemSchema = z.looseObject({ id: z.string().min(1).optional(), type: z.string().optional() });

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

const hashKey = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;

const phoneNumberIdOf = (value: Record<string, unknown>) => {
  const parsed = z.object({ metadata: z.object({ phone_number_id: z.string().min(1) }) }).safeParse(value);
  return parsed.success ? parsed.data.metadata.phone_number_id : null;
};

// Splits a delivery into one inbox event per message, status or other change,
// so the same event dedupes to the same key whichever batch carries it.
export const splitDelivery = (delivery: unknown): InboxEventInput[] => {
  const parsed = deliverySchema.safeParse(delivery);
  if (!parsed.success) {
    // Signed by Meta but not understood: keep it whole for inspection.
    return [{ dedupeKey: hashKey(delivery), field: "unrecognized", phoneNumberId: null, payload: delivery }];
  }
  const events = parsed.data.entry.flatMap((entry) => entry.changes.flatMap(({ field, value }) => {
    const phoneNumberId = phoneNumberIdOf(value);
    const arrays = eventArrays[field] ?? [];
    const shared = Object.fromEntries(Object.entries(value).filter(([key]) => !arrays.some((array) => array.key === key)));
    const items = arrays.flatMap(({ key, byWamid, split = (item) => [item] }) =>
      (Array.isArray(value[key]) ? value[key] : []).flatMap(split).map((item: unknown) => {
        const { id, type } = itemSchema.catch({}).parse(item);
        return {
          dedupeKey: byWamid && id && !referencingTypes.has(type ?? "")
            ? `${field}:${id}`
            : hashKey({ field, phoneNumberId, [key]: item }),
          field,
          phoneNumberId,
          payload: { wabaId: entry.id, field, value: { ...shared, [key]: [item] } },
        };
      }));
    return items.length > 0 ? items : [{
      dedupeKey: hashKey({ field, phoneNumberId, value }),
      field,
      phoneNumberId,
      payload: { wabaId: entry.id, field, value },
    }];
  }));
  // A batch may repeat an event; store it once.
  return [...new Map(events.map((event) => [event.dedupeKey, event])).values()];
};

// Meta's Unix timestamp in seconds.
const timestampSchema = z.string().regex(/^\d{1,12}$/).transform((seconds) => new Date(Number(seconds) * 1000));

const textSchema = z.object({ body: z.string() });

// Group chats are outside the product: a message in one names its group.
const notInGroup = { group_id: z.never().optional() };

const waIdSchema = z.string().regex(/^\d{1,20}$/);
const recipientIdSchema = z.string().regex(/^\+?\d{1,20}$/).transform((phone) => phone.replace("+", ""));

const textMessageEventSchema = z.object({
  field: z.literal("messages"),
  value: z.object({
    contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
    messages: z.tuple([z.object({
      from: waIdSchema,
      id: z.string().min(1),
      timestamp: timestampSchema,
      type: z.literal("text"),
      text: textSchema,
      ...notInGroup,
    })]),
  }),
});

// The Contact's text message an inbox event carries, if it carries one.
export const readInboundTextMessage = (payload: unknown): InboundTextMessage | null => {
  const parsed = textMessageEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [inbound] = parsed.data.value.messages;
  const sender = parsed.data.value.contacts?.find((candidate) => candidate.wa_id === inbound.from);
  return {
    wamid: inbound.id,
    from: inbound.from,
    profileName: sender?.profile?.name ?? null,
    text: inbound.text.body,
    sentAt: inbound.timestamp,
  };
};

const statusEventSchema = z.object({
  field: z.literal("messages"),
  value: z.object({
    statuses: z.tuple([z.object({
      id: z.string().min(1),
      status: z.enum(["sent", "delivered", "read", "failed"]),
    })]),
  }),
});

// The delivery status of a sent message an inbox event carries, if any.
export const readMessageStatus = (payload: unknown): MessageStatusUpdate | null => {
  const parsed = statusEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [{ id, status }] = parsed.data.value.statuses;
  return { wamid: id, status };
};

const messageEchoEventSchema = z.object({
  field: z.literal("smb_message_echoes"),
  value: z.object({
    message_echoes: z.tuple([z.object({
      // Meta's reference shows the recipient both with and without "+".
      to: recipientIdSchema,
      id: z.string().min(1),
      timestamp: timestampSchema,
      type: z.literal("text"),
      text: textSchema,
      ...notInGroup,
    })]),
  }),
});

// The text a Member sent from the WhatsApp Business app that an inbox event
// echoes, if any.
export const readMessageEcho = (payload: unknown): MessageEcho | null => {
  const parsed = messageEchoEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [echo] = parsed.data.value.message_echoes;
  return { wamid: echo.id, to: echo.to, text: echo.text.body, sentAt: echo.timestamp };
};

const changeEnvelope = { id: z.string().min(1), timestamp: timestampSchema };

const changeSchema = z.discriminatedUnion("type", [
  z.object({
    ...changeEnvelope,
    type: z.literal("edit"),
    // Edits to media captions are not shown yet.
    edit: z.object({
      original_message_id: z.string().min(1),
      message: z.object({ type: z.literal("text"), text: textSchema }),
    }),
  }),
  z.object({
    ...changeEnvelope,
    type: z.literal("revoke"),
    revoke: z.object({ original_message_id: z.string().min(1) }),
  }),
]);

// The Contact changes their inbound messages; the app, the Tenant's outbound ones.
const messageChangeEventSchema = z.union([
  z.object({ field: z.literal("messages"), value: z.object({ messages: z.tuple([changeSchema.and(z.object({ from: waIdSchema }))]) }) })
    .transform(({ value }) => ({ direction: "inbound" as const, phone: value.messages[0].from, change: value.messages[0] })),
  z.object({ field: z.literal("smb_message_echoes"), value: z.object({
    message_echoes: z.tuple([changeSchema.and(z.object({ to: recipientIdSchema }))]),
  }) })
    .transform(({ value }) => ({ direction: "outbound" as const, phone: value.message_echoes[0].to, change: value.message_echoes[0] })),
]);

// The Contact's edit or revoke of their message, or an app edit or revoke of
// the Tenant's, that an inbox event carries, if any.
export const readMessageChange = (payload: unknown): MessageChange | null => {
  const parsed = messageChangeEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { direction, phone, change } = parsed.data;
  const event = { wamid: change.id, direction, phone, changedAt: change.timestamp };
  return change.type === "edit"
    ? { ...event, originalWamid: change.edit.original_message_id, kind: "edit", text: change.edit.message.text.body }
    : { ...event, originalWamid: change.revoke.original_message_id, kind: "revoke" };
};

// How far an app message had got when history was shared. A pending one
// shows no status rather than one the platform is still sending.
const historyStatuses = {
  PENDING: null, SENT: "sent", DELIVERED: "delivered", READ: "read", PLAYED: "read", ERROR: "failed",
} as const;

const historyMessageSchema = z.object({
  from: waIdSchema,
  id: z.string().min(1),
  timestamp: timestampSchema,
  type: z.literal("text"),
  text: textSchema,
  history_context: z.object({ status: z.enum(Object.keys(historyStatuses) as (keyof typeof historyStatuses)[]) }).optional(),
  ...notInGroup,
});

const historyEventSchema = z.object({
  field: z.literal("history"),
  value: z.object({
    history: z.tuple([z.union([
      // Any error means the history will not arrive, 2593109 being the
      // business declining to share it.
      z.object({ errors: z.array(z.object({ code: z.number() })).min(1) }).transform(() => ({ declined: true as const })),
      z.object({
        // A thread's id is the Contact's wa_id; groups are not threads with a Contact.
        threads: z.tuple([z.object({ id: waIdSchema, messages: z.array(z.unknown()) })]),
      }).transform(({ threads: [thread] }) => ({ declined: false as const, thread })),
    ])]),
  }),
});

// One Contact's part of a shared app history chunk, keeping only the text
// messages the inbox shows; or whether the business declined to share it.
export const readHistory = (payload: unknown): { declined: true } | { declined: false; history: ImportedHistory } | null => {
  const parsed = historyEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [history] = parsed.data.value.history;
  if (history.declined) return history;
  const { id: phone, messages } = history.thread;
  return {
    declined: false,
    history: {
      phone,
      messages: messages.flatMap((candidate) => {
        const parsedMessage = historyMessageSchema.safeParse(candidate);
        if (!parsedMessage.success) return [];
        const { from, id, timestamp, text, history_context: context } = parsedMessage.data;
        // The Contact's own messages come from the thread's wa_id.
        const inbound = from === phone;
        return [{
          wamid: id,
          direction: inbound ? "inbound" as const : "outbound" as const,
          status: inbound ? null : historyStatuses[context?.status ?? "PENDING"],
          text: text.body,
          sentAt: timestamp,
        }];
      }),
    },
  };
};

const appContactEventSchema = z.object({
  field: z.literal("smb_app_state_sync"),
  value: z.object({
    state_sync: z.tuple([z.discriminatedUnion("action", [
      z.object({
        type: z.literal("contact"),
        action: z.literal("add"),
        contact: z.object({ phone_number: z.string(), full_name: z.string().optional(), first_name: z.string().optional() }),
        metadata: z.object({ timestamp: timestampSchema }),
      }),
      z.object({
        type: z.literal("contact"),
        action: z.literal("remove"),
        contact: z.object({ phone_number: z.string() }),
        metadata: z.object({ timestamp: timestampSchema }),
      }),
    ])]),
  }),
});

// A Contact added, edited or removed in the WhatsApp Business app's
// contacts, if the inbox event carries one.
export const readAppContact = (payload: unknown): AppContact | null => {
  const parsed = appContactEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [change] = parsed.data.value.state_sync;
  const phone = waIdSchema.safeParse(change.contact.phone_number.replace(/^\+/, ""));
  if (!phone.success) return null;
  const name = change.action === "add" ? (change.contact.full_name ?? change.contact.first_name)?.trim() || null : null;
  return { phone: phone.data, name, changedAt: change.metadata.timestamp };
};
