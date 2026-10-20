import { sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact, conversation, message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";

export type InboundTextMessage = {
  wamid: string;
  from: string;
  profileName: string | null;
  text: string;
  sentAt: Date;
};

// Files a Contact's message under the Channel's Tenant. Safe to repeat: the
// Contact, Conversation and message are each unique, so a redelivered or
// concurrently processed event changes nothing.
export const recordInboundTextMessage = (db: Database, route: ChannelRoute, inbound: InboundTextMessage) =>
  db.transaction(async (tx) => {
    const [{ contactId }] = await tx.insert(contact)
      .values({ tenantId: route.tenantId, phone: inbound.from, profileName: inbound.profileName })
      .onConflictDoUpdate({
        target: [contact.tenantId, contact.phone],
        set: { profileName: sql`coalesce(excluded.profile_name, ${contact.profileName})` },
      })
      .returning({ contactId: contact.id });
    const [{ conversationId }] = await tx.insert(conversation)
      .values({ tenantId: route.tenantId, channelId: route.channelId, contactId })
      // A no-op update so RETURNING yields the existing Conversation.
      .onConflictDoUpdate({ target: [conversation.channelId, conversation.contactId], set: { tenantId: route.tenantId } })
      .returning({ conversationId: conversation.id });
    await tx.insert(message).values({
      tenantId: route.tenantId,
      conversationId,
      wamid: inbound.wamid,
      direction: "inbound",
      type: "text",
      text: inbound.text,
      sentAt: inbound.sentAt,
    }).onConflictDoNothing({ target: [message.tenantId, message.wamid] });
  });
