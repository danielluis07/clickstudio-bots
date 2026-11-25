import { createHash } from "node:crypto";
import { z } from "zod";

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
export const referencingTypes = new Set(["edit", "revoke", "reaction"]);

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
