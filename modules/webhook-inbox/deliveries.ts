import { createHash } from "node:crypto";
import { z } from "zod";
import type { AccountUpdate } from "@/modules/channels";
import type {
  AppContact,
  ImportedHistory,
  InboundMessage,
  MessageChange,
  MessageEcho,
  MessageStatusUpdate,
} from "@/modules/conversations";

export type InboxEventInput = {
  dedupeKey: string;
  field: string;
  phoneNumberId: string | null;
  // `{ wabaId, field, value }`: Meta's change, narrowed to this one event.
  payload: unknown;
};

const deliverySchema = z.object({
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) })),
    }),
  ),
});

// A history chunk holds many Contacts' threads; each becomes its own event,
// keeping the chunk's metadata.
const historyThreads = (item: unknown): unknown[] => {
  const parsed = z.looseObject({ threads: z.array(z.unknown()).min(1) }).safeParse(item);
  return parsed.success
    ? parsed.data.threads.map((thread) => ({ ...parsed.data, threads: [thread] }))
    : [item];
};

// Arrays that batch several events inside one change, per webhook field.
// Items of `byWamid` arrays are identified by their own wamid on the number
// that received or sent them, since Meta does not promise a wamid is unique
// across numbers; a status only
// refers to a message, so many distinct statuses share one wamid. `split`
// divides an item further.
const eventArrays: Record<
  string,
  { key: string; byWamid: boolean; split?: (item: unknown) => unknown[] }[]
> = {
  messages: [
    { key: "messages", byWamid: true },
    { key: "statuses", byWamid: false },
  ],
  smb_message_echoes: [{ key: "message_echoes", byWamid: true }],
  history: [{ key: "history", byWamid: false, split: historyThreads }],
  smb_app_state_sync: [{ key: "state_sync", byWamid: false }],
};

// Edits, revokes and reactions are about another message; never let them
// collide with it. None is the Contact's live message, so a reaction is never
// stored, never opens the service window and never hands off.
const referencingTypes = new Set(["edit", "revoke", "reaction"]);

const itemSchema = z.looseObject({ id: z.string().min(1).optional(), type: z.string().optional() });

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

const hashKey = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;

const phoneNumberIdOf = (value: Record<string, unknown>) => {
  const parsed = z
    .object({ metadata: z.object({ phone_number_id: z.string().min(1) }) })
    .safeParse(value);
  return parsed.success ? parsed.data.metadata.phone_number_id : null;
};

// Splits a delivery into one inbox event per message, status or other change,
// so the same event dedupes to the same key whichever batch carries it.
export const splitDelivery = (delivery: unknown): InboxEventInput[] => {
  const parsed = deliverySchema.safeParse(delivery);
  if (!parsed.success) {
    // Signed by Meta but not understood: keep it whole for inspection.
    return [
      {
        dedupeKey: hashKey(delivery),
        field: "unrecognized",
        phoneNumberId: null,
        payload: delivery,
      },
    ];
  }
  const events = parsed.data.entry.flatMap((entry) =>
    entry.changes.flatMap(({ field, value }) => {
      const phoneNumberId = phoneNumberIdOf(value);
      const arrays = eventArrays[field] ?? [];
      const shared = Object.fromEntries(
        Object.entries(value).filter(([key]) => !arrays.some((array) => array.key === key)),
      );
      const items = arrays.flatMap(({ key, byWamid, split = (item) => [item] }) =>
        (Array.isArray(value[key]) ? value[key] : []).flatMap(split).map((item: unknown) => {
          const { id, type } = itemSchema.catch({}).parse(item);
          return {
            dedupeKey:
              byWamid && id && phoneNumberId && !referencingTypes.has(type ?? "")
                ? `${field}:${phoneNumberId}:${id}`
                : hashKey({ field, phoneNumberId, [key]: item }),
            field,
            phoneNumberId,
            payload: { wabaId: entry.id, field, value: { ...shared, [key]: [item] } },
          };
        }),
      );
      return items.length > 0
        ? items
        : [
            {
              dedupeKey: hashKey({ field, phoneNumberId, value }),
              field,
              phoneNumberId,
              payload: { wabaId: entry.id, field, value },
            },
          ];
    }),
  );
  // A batch may repeat an event; store it once.
  return [...new Map(events.map((event) => [event.dedupeKey, event])).values()];
};

// Meta's Unix timestamp in seconds.
const timestampSchema = z
  .string()
  .regex(/^\d{1,12}$/)
  .transform((seconds) => new Date(Number(seconds) * 1000));

const textSchema = z.object({ body: z.string() });

// Group chats are outside the product: a message in one names its group.
const notInGroup = { group_id: z.never().optional() };

const waIdSchema = z.string().regex(/^\d{1,20}$/);
const recipientIdSchema = z
  .string()
  .regex(/^\+?\d{1,20}$/)
  .transform((phone) => phone.replace("+", ""));

const inboundMessageEventSchema = z.object({
  field: z.literal("messages"),
  value: z.object({
    contacts: z
      .array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() }))
      .optional(),
    messages: z.tuple([
      z.looseObject({
        from: waIdSchema,
        id: z.string().min(1),
        timestamp: timestampSchema,
        type: z.string().min(1),
        text: textSchema.optional(),
        ...notInGroup,
      }),
    ]),
  }),
});

const mediaTypeSchema = z.enum(["audio", "image", "video", "document", "sticker", "unsupported"]);
const captionSchema = z.object({ caption: z.string().optional() });

// The Contact's live message, without fetching or retaining media content.
export const readInboundMessage = (payload: unknown): InboundMessage | null => {
  const parsed = inboundMessageEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [inbound] = parsed.data.value.messages;
  if (referencingTypes.has(inbound.type) || (inbound.type === "text" && !inbound.text)) return null;
  const type =
    inbound.type === "text" ? "text" : mediaTypeSchema.catch("unsupported").parse(inbound.type);
  const media = captionSchema.safeParse(inbound[inbound.type]);
  const sender = parsed.data.value.contacts?.find((candidate) => candidate.wa_id === inbound.from);
  return {
    wamid: inbound.id,
    from: inbound.from,
    profileName: sender?.profile?.name ?? null,
    type,
    text:
      type === "text"
        ? inbound.text!.body
        : type !== "audio" && media.success
          ? media.data.caption?.trim() || null
          : null,
    sentAt: inbound.timestamp,
  };
};

const statusEventSchema = z.object({
  field: z.literal("messages"),
  value: z.object({
    statuses: z.tuple([
      z.object({
        id: z.string().min(1),
        status: z.enum(["sent", "delivered", "read", "failed"]),
        // Why Meta could not deliver it; only a failed status carries it.
        errors: z
          .array(z.object({ code: z.number().int() }))
          .optional()
          .catch(undefined),
      }),
    ]),
  }),
});

// The delivery status of a sent message an inbox event carries, if any.
export const readMessageStatus = (payload: unknown): MessageStatusUpdate | null => {
  const parsed = statusEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const [{ id, status, errors }] = parsed.data.value.statuses;
  return {
    wamid: id,
    status,
    failureCode: status === "failed" ? (errors?.[0]?.code ?? null) : null,
  };
};

const messageEchoEventSchema = z.object({
  field: z.literal("smb_message_echoes"),
  value: z.object({
    message_echoes: z.tuple([
      z.object({
        // Meta's reference shows the recipient both with and without "+".
        to: recipientIdSchema,
        id: z.string().min(1),
        timestamp: timestampSchema,
        type: z.literal("text"),
        text: textSchema,
        ...notInGroup,
      }),
    ]),
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
  z
    .object({
      field: z.literal("messages"),
      value: z.object({ messages: z.tuple([changeSchema.and(z.object({ from: waIdSchema }))]) }),
    })
    .transform(({ value }) => ({
      direction: "inbound" as const,
      phone: value.messages[0].from,
      change: value.messages[0],
    })),
  z
    .object({
      field: z.literal("smb_message_echoes"),
      value: z.object({
        message_echoes: z.tuple([changeSchema.and(z.object({ to: recipientIdSchema }))]),
      }),
    })
    .transform(({ value }) => ({
      direction: "outbound" as const,
      phone: value.message_echoes[0].to,
      change: value.message_echoes[0],
    })),
]);

// The Contact's edit or revoke of their message, or an app edit or revoke of
// the Tenant's, that an inbox event carries, if any.
export const readMessageChange = (payload: unknown): MessageChange | null => {
  const parsed = messageChangeEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { direction, phone, change } = parsed.data;
  const event = { wamid: change.id, direction, phone, changedAt: change.timestamp };
  return change.type === "edit"
    ? {
        ...event,
        originalWamid: change.edit.original_message_id,
        kind: "edit",
        text: change.edit.message.text.body,
      }
    : { ...event, originalWamid: change.revoke.original_message_id, kind: "revoke" };
};

// How far an app message had got when history was shared. A pending one
// shows no status rather than one the platform is still sending.
const historyStatuses = {
  PENDING: null,
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
} as const;

const historyMessageSchema = z.object({
  from: waIdSchema,
  id: z.string().min(1),
  timestamp: timestampSchema,
  type: z.literal("text"),
  text: textSchema,
  history_context: z
    .object({ status: z.enum(Object.keys(historyStatuses) as (keyof typeof historyStatuses)[]) })
    .optional(),
  ...notInGroup,
});

const historyEventSchema = z.object({
  field: z.literal("history"),
  value: z.object({
    history: z.tuple([
      z.union([
        // Any error means the history will not arrive, 2593109 being the
        // business declining to share it.
        z
          .object({ errors: z.array(z.object({ code: z.number() })).min(1) })
          .transform(() => ({ declined: true as const })),
        z
          .object({
            // A thread's id is the Contact's wa_id; groups are not threads with a Contact.
            threads: z.tuple([z.object({ id: waIdSchema, messages: z.array(z.unknown()) })]),
          })
          .transform(({ threads: [thread] }) => ({ declined: false as const, thread })),
      ]),
    ]),
  }),
});

// One Contact's part of a shared app history chunk, keeping only the text
// messages the inbox shows; or whether the business declined to share it.
export const readHistory = (
  payload: unknown,
): { declined: true } | { declined: false; history: ImportedHistory } | null => {
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
        return [
          {
            wamid: id,
            direction: inbound ? ("inbound" as const) : ("outbound" as const),
            status: inbound ? null : historyStatuses[context?.status ?? "PENDING"],
            text: text.body,
            sentAt: timestamp,
          },
        ];
      }),
    },
  };
};

const appContactEventSchema = z.object({
  field: z.literal("smb_app_state_sync"),
  value: z.object({
    state_sync: z.tuple([
      z.discriminatedUnion("action", [
        z.object({
          type: z.literal("contact"),
          action: z.literal("add"),
          contact: z.object({
            phone_number: z.string(),
            full_name: z.string().optional(),
            first_name: z.string().optional(),
          }),
          metadata: z.object({ timestamp: timestampSchema }),
        }),
        z.object({
          type: z.literal("contact"),
          action: z.literal("remove"),
          contact: z.object({ phone_number: z.string() }),
          metadata: z.object({ timestamp: timestampSchema }),
        }),
      ]),
    ]),
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
  const name =
    change.action === "add"
      ? (change.contact.full_name ?? change.contact.first_name)?.trim() || null
      : null;
  return { phone: phone.data, name, changedAt: change.metadata.timestamp };
};

// The WABA an event names: Meta's entry id, kept on every split event.
export const readWabaId = (payload: unknown) => {
  const parsed = z.object({ wabaId: z.string().min(1) }).safeParse(payload);
  return parsed.success ? parsed.data.wabaId : null;
};

// `account_update` events that end the app's access to the number: the
// business removed the partner or uninstalled the app, deleted the WABA, or
// moved its number off the Cloud API.
const removalEvents = new Set([
  "PARTNER_REMOVED",
  "PARTNER_APP_UNINSTALLED",
  "ACCOUNT_DELETED",
  "ACCOUNT_OFFBOARDED",
]);

// `account_update` events Meta documents that never change whether the Bot
// can reply. A restriction or ban state not listed here is read below.
const knownAccountEvents = new Set([
  "ACCOUNT_RECONNECTED",
  "ACCOUNT_VIOLATION",
  "AUTH_INTL_PRICE_ELIGIBILITY_UPDATE",
  "BUSINESS_PRIMARY_LOCATION_COUNTRY_UPDATE",
  "MM_LITE_TERMS_SIGNED",
  "PARTNER_ADDED",
  "PARTNER_APP_INSTALLED",
  "PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE",
  "VERIFIED_ACCOUNT",
  "VOLUME_BASED_PRICING_TIER_UPDATE",
]);

// Meta's Unix timestamp in seconds, as a number or a string.
const expirationSchema = z
  .union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)])
  .transform((seconds) => new Date(Number(seconds) * 1000));

const accountUpdateEventSchema = z.object({
  field: z.literal("account_update"),
  value: z.looseObject({
    event: z.string().min(1),
    ban_info: z
      .object({ waba_ban_state: z.union([z.string(), z.array(z.string())]) })
      .optional()
      .catch(undefined),
    restriction_info: z
      .array(z.object({ restriction_type: z.string(), expiration: expirationSchema.optional() }))
      .optional()
      .catch(undefined),
  }),
});

// What an `account_update` event means for the Channel: an update to apply,
// "known" for a documented event that changes nothing, or null for an event
// the platform does not know, which stays inspectable as unsupported.
export const readAccountUpdate = (payload: unknown): AccountUpdate | "known" | null => {
  const parsed = accountUpdateEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { event, ban_info: ban, restriction_info: restrictions } = parsed.data.value;
  if (removalEvents.has(event)) return { kind: "removed" };
  if (knownAccountEvents.has(event)) return "known";
  if (event === "DISABLED_UPDATE") {
    const states = [ban?.waba_ban_state ?? []].flat();
    if (states.includes("DISABLE")) return { kind: "banned" };
    if (states.includes("REINSTATE")) return { kind: "reinstated" };
    // A ban only scheduled still lets the number send.
    return states.includes("SCHEDULE_FOR_DISABLE") ? "known" : null;
  }
  if (event === "ACCOUNT_RESTRICTION") {
    if (!restrictions) return null;
    // Only a block on replying to Contacts stops the Bot; it never starts
    // conversations or adds numbers.
    const replies = restrictions.find(
      ({ restriction_type: type }) => type === "RESTRICTED_CUSTOMER_INITIATED_MESSAGING",
    );
    return replies ? { kind: "restricted", until: replies.expiration ?? null } : "known";
  }
  return null;
};
