import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "@/db/columns";
import { errorClasses } from "@/platform/diagnostics";

// One event of a signed Meta webhook delivery (ADR 0002). Rows keep their raw
// content for 30 days; the dedupe key makes redelivery a no-op.
export const inboxEvent = pgTable(
  "inbox_event",
  {
    id: id(),
    // `<field>:<wamid>` when the wamid identifies the event, otherwise a hash.
    dedupeKey: text("dedupe_key").notNull().unique(),
    field: text("field").notNull(),
    phoneNumberId: text("phone_number_id"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status", { enum: ["pending", "failed", "processed", "ignored"] })
      .notNull()
      .default("pending"),
    errorClass: text("error_class", { enum: errorClasses }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    ignoredReason: text("ignored_reason", { enum: ["unknown_channel", "unsupported_event"] }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("inbox_event_status_received_at_idx").on(t.status, t.receivedAt),
    index("inbox_event_received_at_idx").on(t.receivedAt),
  ],
);
