import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/db/columns";
import { organization } from "@/db/schema/tenancy";
import type { EncryptedWhatsAppToken } from "@/platform/whatsapp-credentials";

export const channel = pgTable("channel", {
  id: id(),
  tenantId: text("tenant_id").notNull().unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  wabaId: text("waba_id").notNull().unique(),
  phoneNumberId: text("phone_number_id").notNull().unique(),
  displayPhoneNumber: text("display_phone_number").notNull(),
  credential: jsonb("credential").$type<EncryptedWhatsAppToken>().notNull(),
  botEnabled: boolean("bot_enabled").notNull().default(false),
  subscriptionStatus: text("subscription_status", { enum: ["pending", "subscribed", "failed"] }).notNull().default("pending"),
  subscriptionFields: jsonb("subscription_fields").$type<string[]>().notNull(),
  subscriptionAttemptedAt: timestamp("subscription_attempted_at", { withTimezone: true }),
  subscriptionError: text("subscription_error"),
  ...timestamps(),
});
