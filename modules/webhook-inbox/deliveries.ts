import { createHash } from "node:crypto";
import { z } from "zod";
import type { InboundTextMessage } from "@/modules/conversations";

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

// Arrays that batch several events inside one change, per webhook field.
// Items of `byWamid` arrays are identified by their own wamid; a status only
// refers to a message, so many distinct statuses share one wamid.
const eventArrays: Record<string, { key: string; byWamid: boolean }[]> = {
  messages: [{ key: "messages", byWamid: true }, { key: "statuses", byWamid: false }],
  smb_message_echoes: [{ key: "message_echoes", byWamid: true }],
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
    const items = arrays.flatMap(({ key, byWamid }) =>
      (Array.isArray(value[key]) ? value[key] : []).map((item: unknown) => {
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

const textMessageEventSchema = z.object({
  field: z.literal("messages"),
  value: z.object({
    contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
    messages: z.tuple([z.object({
      from: z.string().regex(/^\d{1,20}$/),
      id: z.string().min(1),
      timestamp: z.string().regex(/^\d{1,12}$/),
      type: z.literal("text"),
      text: z.object({ body: z.string() }),
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
    sentAt: new Date(Number(inbound.timestamp) * 1000),
  };
};
