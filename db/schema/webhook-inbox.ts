import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "@/db/columns";
import { errorClasses } from "@/platform/diagnostics";

// One event of a signed Meta webhook delivery (ADR 0002). Rows keep their raw
// content for 30 days, or until their Contact is deleted (#150); the dedupe
// key makes redelivery a no-op.
export const inboxEvent = pgTable(
  "inbox_event",
  {
    id: id(),
    // `<field>:<wamid>` when the wamid identifies the event, otherwise a hash.
    dedupeKey: text("dedupe_key").notNull().unique(),
    field: text("field").notNull(),
    phoneNumberId: text("phone_number_id"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    // The one Contact address a split event is about: the sender of a
    // message, edit or reaction, or the recipient of a status or echo, a
    // history thread's wa_id or an app contact's number. Null for events
    // about no Contact. Contact deletion finds its events by it.
    contactPhone: text("contact_phone").generatedAlwaysAs(
      sql`ltrim(coalesce(
        payload #>> '{value,messages,0,from}',
        payload #>> '{value,statuses,0,recipient_id}',
        payload #>> '{value,message_echoes,0,to}',
        payload #>> '{value,history,0,threads,0,id}',
        payload #>> '{value,state_sync,0,contact,phone_number}'
      ), '+')`,
    ),
    status: text("status", { enum: ["pending", "failed", "processed", "ignored"] })
      .notNull()
      .default("pending"),
    errorClass: text("error_class", { enum: errorClasses }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    // Automatic replays of a failed event so far, and when the latest one, or
    // an administrator's bulk replay, put it back on the queue (#135).
    autoRetries: integer("auto_retries").notNull().default(0),
    retriedAt: timestamp("retried_at", { withTimezone: true }),
    // `known_event`: an event Meta documents that never changes what the
    // platform does, such as most `account_update` events.
    ignoredReason: text("ignored_reason", {
      enum: ["unknown_channel", "unsupported_event", "known_event", "contact_deleted"],
    }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("inbox_event_status_received_at_idx").on(t.status, t.receivedAt),
    index("inbox_event_received_at_idx").on(t.receivedAt),
    index("inbox_event_contact_idx").on(t.phoneNumberId, t.contactPhone),
  ],
);
