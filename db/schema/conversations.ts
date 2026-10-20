import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/db/columns";
import { channel } from "@/db/schema/channels";
import { organization } from "@/db/schema/tenancy";

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
  wamid: text("wamid").notNull(),
  direction: text("direction", { enum: ["inbound"] }).notNull(),
  type: text("type", { enum: ["text"] }).notNull(),
  text: text("text"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("message_tenant_id_wamid_unique").on(t.tenantId, t.wamid),
  index("message_conversation_id_sent_at_idx").on(t.conversationId, t.sentAt),
]);
