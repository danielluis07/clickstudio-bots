import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/db/columns";
import { organization } from "@/db/schema/tenancy";
import type { EncryptedWhatsAppToken } from "@/platform/whatsapp-credentials";

export const channelHealthStates = [
  "healthy",
  "credential_rejected",
  "removed",
  "banned",
  "restricted",
] as const;

export type ChannelHealth = (typeof channelHealthStates)[number];

export const channel = pgTable("channel", {
  id: id(),
  tenantId: text("tenant_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  wabaId: text("waba_id").notNull().unique(),
  phoneNumberId: text("phone_number_id").notNull().unique(),
  displayPhoneNumber: text("display_phone_number").notNull(),
  credential: jsonb("credential").$type<EncryptedWhatsAppToken>().notNull(),
  botEnabled: boolean("bot_enabled").notNull().default(false),
  botPaused: boolean("bot_paused").notNull().default(false),
  subscriptionStatus: text("subscription_status", {
    enum: ["pending", "subscribed", "failed", "disconnected"],
  })
    .notNull()
    .default("pending"),
  subscriptionFields: jsonb("subscription_fields").$type<string[]>().notNull(),
  subscriptionAttemptedAt: timestamp("subscription_attempted_at", { withTimezone: true }),
  subscriptionError: text("subscription_error"),
  // Coexistence lets the platform ask once, within 24 hours of onboarding, for
  // the WhatsApp Business app's contacts and its message history.
  contactsSync: text("contacts_sync", { enum: ["pending", "requested", "failed"] })
    .notNull()
    .default("pending"),
  // `declined` when the business did not share its history (error 2593109).
  historySync: text("history_sync", { enum: ["pending", "requested", "failed", "declined"] })
    .notNull()
    .default("pending"),
  // Whether Meta still lets the Channel send (#145). Anything but `healthy`
  // stops new Bot turns: `credential_rejected` and `removed` until the owner
  // reconnects, `banned` until Meta reinstates the account, and `restricted`
  // until `restrictedUntil`, or for good when Meta gave no end.
  health: text("health", { enum: channelHealthStates }).notNull().default("healthy"),
  healthChangedAt: timestamp("health_changed_at", { withTimezone: true }),
  // When the platform administrator was alerted about the current health.
  healthAlertedAt: timestamp("health_alerted_at", { withTimezone: true }),
  restrictedUntil: timestamp("restricted_until", { withTimezone: true }),
  ...timestamps(),
});
