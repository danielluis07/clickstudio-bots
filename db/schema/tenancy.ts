import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@/db/schema/auth";
import { id, timestamps } from "@/db/columns";

// A Tenant is a Better Auth organization; the table keeps the plugin's names.
export const organization = pgTable(
  "organization",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    // Serializes Meta calls without keeping a transaction open over the network.
    lifecycleToken: text("lifecycle_token"),
    lifecycleLeaseUntil: timestamp("lifecycle_lease_until", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("organization_canceled_at_idx").on(t.canceledAt)],
);

// The organization plugin's default roles and invitation statuses.
export const memberRoles = ["owner", "admin", "member"] as const;
const invitationStatuses = ["pending", "accepted", "rejected", "canceled"] as const;

export const member = pgTable(
  "member",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: memberRoles }).notNull().default("member"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("member_organization_id_user_id_unique").on(t.organizationId, t.userId),
    index("member_user_id_idx").on(t.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: memberRoles }),
    status: text("status", { enum: invitationStatuses }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    index("invitation_organization_id_idx").on(t.organizationId),
    index("invitation_email_idx").on(t.email),
  ],
);

// What a Member or the platform administrator did to Tenant data. Each value
// names the record its `subject_id` points at, if any.
export const memberActivityActions = [
  "conversation.taken_over",
  "conversation.returned_to_bot",
  "conversation.resolved",
  "contact.deleted",
  "invitation.created",
  "invitation.canceled",
  "invitation.accepted",
  "member.removed",
  "bot.activated",
  "bot.paused",
  "bot.unpaused",
  "business_profile.saved",
  "behaviour_settings.saved",
  "capture_settings.saved",
  "link_settings.saved",
] as const;

// Append-only: a trigger refuses every update, and every delete while the
// Tenant row still exists. Ids only, never message text, names or phone
// numbers; an id outlives the record it named. No foreign keys: a reference
// to the Tenant row would take `for key share` on it after the action's own
// row locks (docs/locking.md), and a reference to the actor or subject would
// cascade an entry away with them. Tenant deletion removes the entries.
export const memberActivity = pgTable(
  "member_activity",
  {
    id: id(),
    tenantId: text("tenant_id").notNull(),
    // A Member's user id, or the platform administrator's.
    actorUserId: text("actor_user_id").notNull(),
    action: text("action", { enum: memberActivityActions }).notNull(),
    subjectId: text("subject_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("member_activity_tenant_id_occurred_at_idx").on(t.tenantId, t.occurredAt)],
);

// Click-through assent to the Terms and DPA annex given when joining a Tenant.
export const legalAcceptance = pgTable(
  "legal_acceptance",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitation.id, { onDelete: "cascade" }),
    termsVersion: text("terms_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("legal_acceptance_tenant_id_idx").on(t.tenantId)],
);
