import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id } from "@/db/columns";
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
  // The Member who last saved either part. Null once that Member is removed.
  updatedByMemberId: text("updated_by_member_id").references(() => member.id, {
    onDelete: "set null",
  }),
  // The last save of either part: a test older than it is stale.
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  // The Business profile and the Behaviour settings are saved separately.
  // Null until that part is first saved; the row's other part then holds its
  // defaults. A Member id is null once that Member is removed.
  profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
  profileUpdatedByMemberId: text("profile_updated_by_member_id").references(() => member.id, {
    onDelete: "set null",
  }),
  behaviourUpdatedAt: timestamp("behaviour_updated_at", { withTimezone: true }),
  behaviourUpdatedByMemberId: text("behaviour_updated_by_member_id").references(() => member.id, {
    onDelete: "set null",
  }),
});

// The Contact capture capability, saved by the owner. Absent until the first
// save, which means disabled.
export const botCaptureSettings = pgTable("bot_capture_settings", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull(),
  // "off", "optional" or "required" per Contact detail, keyed by its name.
  fields: jsonb("fields").$type<Record<string, "off" | "optional" | "required">>().notNull(),
  // The Member who last saved them. Null once that Member is removed.
  updatedByMemberId: text("updated_by_member_id").references(() => member.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// The owner's bounded link catalog. Absent until first save, which means disabled.
export const botLinkSettings = pgTable("bot_link_settings", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull(),
  links: jsonb("links").$type<{ id: string; label: string; url: string }[]>().notNull(),
  updatedByMemberId: text("updated_by_member_id").references(() => member.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Separate from production usage. One row per Tenant, with no sandbox content.
export const botSandboxUsage = pgTable("bot_sandbox_usage", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  turns: integer("turns").notNull(),
});

// Acknowledged production replies survive Contact/message deletion. No content.
export const botReplyUsage = pgTable(
  "bot_reply_usage",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    period: date("period").notNull(),
    replies: integer("replies").notNull(),
    warningTo: text("warning_to"),
    warningClaimToken: text("warning_claim_token"),
    warningLeaseUntil: timestamp("warning_lease_until", { withTimezone: true }),
    warningSentAt: timestamp("warning_sent_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.period] })],
);

// One row per live Bot turn (#137): how it ended, what its Model requests
// cost and how long it took. Counts and codes only, never message text, names
// or phone numbers, so it survives Contact deletion. Kept 13 months, deleted
// with the Tenant and left out of the Tenant export.
export const botTurnRecord = pgTable(
  "bot_turn_record",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // When the turn finished.
    at: timestamp("at", { withTimezone: true }).notNull(),
    // "handoff" whenever the turn handed off, even with a reply sent.
    // "retried": an attempt its job retries after a transient Model failure;
    // the turn ends in a later row.
    outcome: text("outcome", { enum: ["sent", "skipped", "handoff", "retried"] }).notNull(),
    handoffReason: text("handoff_reason", {
      enum: [
        "no_answer",
        "contact_request",
        "handoff_topic",
        "bot_unavailable",
        "allowance_exhausted",
        "contact_cap_reached",
      ],
    }),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    toolRoundTrips: integer("tool_round_trips").notNull(),
    durationMs: integer("duration_ms").notNull(),
  },
  (t) => [
    index("bot_turn_record_tenant_id_at_idx").on(t.tenantId, t.at),
    index("bot_turn_record_at_idx").on(t.at),
  ],
);

// Only the test time is retained, never the sandbox transcript.
export const botActivation = pgTable("bot_activation", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  testedAt: timestamp("tested_at", { withTimezone: true }).notNull(),
});
