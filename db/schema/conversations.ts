import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/db/columns";
import { channel } from "@/db/schema/channels";
import { member, organization } from "@/db/schema/tenancy";

// Minimal replay barrier, independent of the deleted Contact's id. Keep no
// name, phone, message text or captured data. The cutoff survives a fresh
// Contact so late historical events cannot restore earlier content.
export const contactDeletion = pgTable("contact_deletion", {
  tenantId: text("tenant_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  addressHash: text("address_hash").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("contact_deletion_tenant_id_address_hash_unique").on(t.tenantId, t.addressHash)]);

export const contact = pgTable("contact", {
  id: id(),
  tenantId: text("tenant_id").notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // The Contact's WhatsApp id (wa_id), their phone number in digits.
  phone: text("phone").notNull(),
  // The WhatsApp profile name, refreshed from each inbound message.
  profileName: text("profile_name"),
  // The name a Member gave the Contact. Shown instead of the profile name and
  // never overwritten by inbound messages.
  name: text("name"),
  // The name saved for the Contact in the WhatsApp Business app's contacts,
  // synced through coexistence, and when the app last changed it.
  appName: text("app_name"),
  appNameChangedAt: timestamp("app_name_changed_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [uniqueIndex("contact_tenant_id_phone_unique").on(t.tenantId, t.phone)]);

export const conversation = pgTable("conversation", {
  id: id(),
  tenantId: text("tenant_id").notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull().references(() => channel.id),
  contactId: text("contact_id").notNull()
    .references(() => contact.id, { onDelete: "cascade" }),
  // When the latest message was sent; the inbox lists the most recent first.
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex("conversation_channel_id_contact_id_unique").on(t.channelId, t.contactId),
  index("conversation_tenant_id_last_message_at_idx").on(t.tenantId, t.lastMessageAt.desc(), t.id.desc()),
]);

export const message = pgTable("message", {
  id: id(),
  tenantId: text("tenant_id").notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  // Null only while a dashboard reply awaits Meta's answer, or after Meta
  // refused it.
  wamid: text("wamid"),
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  // Who wrote it: the Contact, a Member replying from the dashboard, or a
  // Member replying from the WhatsApp Business app, seen through its echo.
  origin: text("origin", { enum: ["contact", "dashboard", "app"] }).notNull(),
  // The Member who wrote a dashboard reply. Null for other origins, and once
  // that Member is removed.
  authorMemberId: text("author_member_id").references(() => member.id, { onDelete: "set null" }),
  // Delivery of an outbound message; null for inbound ones. Only moves forward.
  status: text("status", { enum: ["pending", "sent", "delivered", "read", "failed"] }),
  type: text("type", { enum: ["text"] }).notNull(),
  text: text("text"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  // Shared from the WhatsApp Business app's history after onboarding. Never a
  // reason for a Bot turn, a Handoff or a counted Bot reply.
  imported: boolean("imported").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("message_tenant_id_wamid_unique").on(t.tenantId, t.wamid),
  index("message_conversation_id_sent_at_idx").on(t.conversationId, t.sentAt),
]);

// An edit or revoke of a message, by the Contact or by a Member in the
// WhatsApp Business app. Kept apart from the message and matched to it by the
// original's wamid when read, so it applies whichever of the two arrives first.
export const messageChange = pgTable("message_change", {
  id: id(),
  tenantId: text("tenant_id").notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // The change event's own wamid.
  wamid: text("wamid").notNull(),
  originalWamid: text("original_wamid").notNull(),
  // Locates an edit for erasure even if its original message has not arrived.
  contactAddressHash: text("contact_address_hash").notNull(),
  // The direction of the changed message: the Contact changes only their own
  // messages, and the Tenant only its own.
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  kind: text("kind", { enum: ["edit", "revoke"] }).notNull(),
  // An edit's new text; null for a revoke.
  text: text("text"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("message_change_tenant_id_kind_wamid_unique").on(t.tenantId, t.kind, t.wamid),
  index("message_change_tenant_id_original_wamid_idx").on(t.tenantId, t.originalWamid),
  index("message_change_tenant_id_contact_address_hash_idx").on(t.tenantId, t.contactAddressHash),
]);
