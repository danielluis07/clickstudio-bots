import { sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { contact, conversation, message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { lockContact, predatesDeletion } from "@/modules/conversations/contact-deletion";

export type InboundTextMessage = {
  wamid: string;
  from: string;
  profileName: string | null;
  text: string;
  sentAt: Date;
  receivedAt?: Date;
};

// The Contact with this phone and their Conversation on the route's Channel,
// created on first contact. A message sent at `sentAt` is the latest activity
// unless a later one is already filed.
export const fileConversation = async (tx: Transaction, route: ChannelRoute, { phone, profileName, sentAt, receivedAt }: {
  phone: string;
  profileName: string | null;
  sentAt: Date;
  receivedAt?: Date;
}) => {
  const deletedAt = await lockContact(tx, route.tenantId, phone);
  if (predatesDeletion(deletedAt, sentAt, receivedAt)) return null;
  const [{ contactId }] = await tx.insert(contact)
    .values({ tenantId: route.tenantId, phone, profileName })
    .onConflictDoUpdate({
      target: [contact.tenantId, contact.phone],
      set: { profileName: sql`coalesce(excluded.profile_name, ${contact.profileName})` },
    })
    .returning({ contactId: contact.id });
  const [{ conversationId }] = await tx.insert(conversation)
    .values({ tenantId: route.tenantId, channelId: route.channelId, contactId, lastMessageAt: sentAt })
    // Messages can arrive out of order, so the latest activity only moves forward.
    .onConflictDoUpdate({
      target: [conversation.channelId, conversation.contactId],
      set: { lastMessageAt: sql`greatest(${conversation.lastMessageAt}, excluded.last_message_at)` },
    })
    .returning({ conversationId: conversation.id });
  return conversationId;
};

// Files a Contact's message under the Channel's Tenant. Safe to repeat: the
// Contact, Conversation and message are each unique, so a redelivered or
// concurrently processed event changes nothing.
export const recordInboundTextMessage = (db: Database, route: ChannelRoute, inbound: InboundTextMessage) =>
  db.transaction(async (tx) => {
    const conversationId = await fileConversation(tx, route, {
      phone: inbound.from,
      profileName: inbound.profileName,
      sentAt: inbound.sentAt,
      receivedAt: inbound.receivedAt,
    });
    if (!conversationId) return null;
    await tx.insert(message).values({
      tenantId: route.tenantId,
      conversationId,
      wamid: inbound.wamid,
      direction: "inbound",
      origin: "contact",
      type: "text",
      text: inbound.text,
      sentAt: inbound.sentAt,
    }).onConflictDoNothing({ target: [message.tenantId, message.wamid] });
    return conversationId;
  });
