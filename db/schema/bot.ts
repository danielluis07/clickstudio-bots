import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { member, organization } from "@/db/schema/tenancy";

// A Tenant's Bot behaviour settings, saved by its owner. Absent until the
// first save; saved edits are live, with no drafts or versions.
export const botSettings = pgTable("bot_settings", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  offer: text("offer").notNull(),
  address: text("address").notNull(),
  // An { opens, closes } interval ("HH:MM") or null per weekday, keyed by its
  // English name.
  hours: jsonb("hours").$type<Record<string, { opens: string; closes: string } | null>>().notNull(),
  tone: text("tone", { enum: ["formal", "neutral", "casual"] }).notNull(),
  emoji: boolean("emoji").notNull(),
  greeting: text("greeting").notNull(),
  rules: text("rules").notNull(),
  refusedTopics: jsonb("refused_topics").$type<string[]>().notNull(),
  handoffTopics: jsonb("handoff_topics").$type<string[]>().notNull(),
  schedule: text("schedule", { enum: ["always", "outside_business_hours"] }).notNull(),
  // The Member who last saved them. Null once that Member is removed.
  updatedByMemberId: text("updated_by_member_id").references(() => member.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
