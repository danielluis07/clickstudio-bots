import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "@/db/columns";
import { channel } from "@/db/schema/channels";
import { member, organization } from "@/db/schema/tenancy";

// Minimal replay barrier, independent of the deleted Contact's id. Keep no
// name, phone, message text or captured data. The cutoff survives a fresh
// Contact so late historical events cannot restore earlier content.
export const contactDeletion = pgTable(
  "contact_deletion",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    addressHash: text("address_hash").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("contact_deletion_tenant_id_address_hash_unique").on(t.tenantId, t.addressHash),
  ],
);

export const contact = pgTable(
  "contact",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
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
    // Details the Bot captured or a Member entered; the name above is the
    // captured name too. Deleted with the Contact.
    email: text("email"),
    city: text("city"),
    need: text("need"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("contact_tenant_id_phone_unique").on(t.tenantId, t.phone)],
);

export const conversation = pgTable(
  "conversation",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channel.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    owner: text("owner", { enum: ["bot", "team"] })
      .notNull()
      .default("bot"),
    // Why the latest Handoff happened. Kept after "Devolver ao Bot" while the
    // Conversation still waits; "Resolvida" clears it.
    handoffReason: text("handoff_reason", {
      enum: [
        "no_answer",
        "contact_request",
        "handoff_topic",
        "bot_unavailable",
        "allowance_exhausted",
        "contact_cap_reached",
        "claimed",
        "dashboard_reply",
        "app_reply",
      ],
    }),
    // On the waiting list for the team. Every Handoff adds it; only "Resolvida"
    // removes it, independently of who owns the Conversation.
    waiting: boolean("waiting").notNull().default(false),
    // A "Bot indisponível" Handoff no Member has acted on since: the Contact's
    // next message returns the Conversation to the Bot. Any Member Handoff
    // clears it.
    resumeOnContactMessage: boolean("resume_on_contact_message").notNull().default(false),
    // The Bot's latest reply was its unavailability notice, and no Member has
    // acted since. A turn that would send it again hands off without it, so a
    // long Model outage tells the Contact once.
    unavailableNoticeSent: boolean("unavailable_notice_sent").notNull().default(false),
    // When a Member last returned the Conversation to the Bot. The daily reply
    // cap per Contact counts only Bot replies sent after it.
    returnedByMemberAt: timestamp("returned_by_member_at", { withTimezone: true }),
    botLeaseToken: text("bot_lease_token"),
    botLeaseUntil: timestamp("bot_lease_until", { withTimezone: true }),
    // When the latest message was sent; the inbox lists the most recent first.
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("conversation_channel_id_contact_id_unique").on(t.channelId, t.contactId),
    index("conversation_tenant_id_last_message_at_idx").on(
      t.tenantId,
      t.lastMessageAt.desc(),
      t.id.desc(),
    ),
    // The sweep's scan for expired leases; only a running turn holds one.
    index("conversation_bot_lease_until_idx")
      .on(t.botLeaseUntil)
      .where(sql`${t.botLeaseUntil} is not null`),
    // The sweep's scan for Handoffs quiet long enough to return to the Bot.
    index("conversation_team_last_message_at_idx")
      .on(t.lastMessageAt)
      .where(sql`${t.owner} = 'team'`),
  ],
);

export const message = pgTable(
  "message",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    // Null only while a dashboard reply awaits Meta's answer, or after Meta
    // refused it.
    wamid: text("wamid"),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    // Who wrote it: the Contact, a Member replying from the dashboard, or a
    // Member replying from the WhatsApp Business app, seen through its echo.
    origin: text("origin", { enum: ["contact", "dashboard", "app", "bot"] }).notNull(),
    // Contact messages covered by a reserved Bot reply. Imported messages never qualify.
    botAnswered: boolean("bot_answered").notNull().default(false),
    answeredMessageId: text("answered_message_id"),
    // The Member who wrote a dashboard reply. Null for other origins, and once
    // that Member is removed.
    authorMemberId: text("author_member_id").references(() => member.id, { onDelete: "set null" }),
    // Delivery of an outbound message; null for inbound ones. Only moves forward.
    status: text("status", { enum: ["pending", "sent", "delivered", "read", "failed"] }),
    // Meta's error code for a `failed` delivery status, when it gave one.
    failureCode: integer("failure_code"),
    // Media keeps only its kind and optional caption, never the attachment.
    type: text("type", {
      enum: ["text", "audio", "image", "video", "document", "sticker", "unsupported"],
    }).notNull(),
    text: text("text"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    // Shared from the WhatsApp Business app's history after onboarding. Never a
    // reason for a Bot turn, a Handoff or a counted Bot reply.
    imported: boolean("imported").notNull().default(false),
    // An app echo filed while a Bot reply awaited Meta's wamid: it may be that
    // reply's own echo, so its Handoff waits until the send's outcome is known.
    echoUnresolved: boolean("echo_unresolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("message_tenant_id_wamid_unique").on(t.tenantId, t.wamid),
    uniqueIndex("message_conversation_answered_message_unique").on(
      t.conversationId,
      t.answeredMessageId,
    ),
    index("message_conversation_id_sent_at_idx").on(t.conversationId, t.sentAt),
    // The sweep's scans across all Tenants: Bot replies stuck before Meta
    // answered, and Contact messages no Bot reply has covered yet.
    index("message_pending_bot_reply_created_at_idx")
      .on(t.createdAt)
      .where(sql`${t.origin} = 'bot' and ${t.status} = 'pending' and ${t.wamid} is null`),
    index("message_unanswered_contact_sent_at_idx")
      .on(t.sentAt)
      .where(sql`${t.origin} = 'contact' and ${t.imported} = false and ${t.botAnswered} = false`),
  ],
);

// An edit or revoke of a message, by the Contact or by a Member in the
// WhatsApp Business app. Kept apart from the message and matched to it by the
// original's wamid when read, so it applies whichever of the two arrives first.
export const messageChange = pgTable(
  "message_change",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
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
  },
  (t) => [
    uniqueIndex("message_change_tenant_id_kind_wamid_unique").on(t.tenantId, t.kind, t.wamid),
    index("message_change_tenant_id_original_wamid_idx").on(t.tenantId, t.originalWamid),
    index("message_change_tenant_id_contact_address_hash_idx").on(t.tenantId, t.contactAddressHash),
  ],
);

// A delivery status that arrived before the platform stored its message's
// wamid. Applied when that wamid is recorded; one for a message the platform
// never stores is pruned. Only moves forward, like the message's own status.
export const earlyMessageStatus = pgTable(
  "early_message_status",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    wamid: text("wamid").notNull(),
    status: text("status", { enum: ["sent", "delivered", "read", "failed"] }).notNull(),
    failureCode: integer("failure_code"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("early_message_status_tenant_id_wamid_unique").on(t.tenantId, t.wamid),
    // The daily prune's scan across all Tenants.
    index("early_message_status_received_at_idx").on(t.receivedAt),
  ],
);
