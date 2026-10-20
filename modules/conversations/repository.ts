import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact, conversation, message } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";

// Member reads of Conversations: every query is bound to the scope's Tenant,
// whatever Conversation id the caller passes.
export const createConversationRepository = (db: Database, scope: TenantScope) => ({
  async listConversations() {
    return db.select({
      id: conversation.id,
      channelId: conversation.channelId,
      contactPhone: contact.phone,
      contactProfileName: contact.profileName,
    }).from(conversation)
      .innerJoin(contact, eq(contact.id, conversation.contactId))
      .where(eq(conversation.tenantId, scope.tenantId))
      .orderBy(asc(conversation.createdAt), asc(conversation.id));
  },

  async listMessages(conversationId: string) {
    return db.select({
      wamid: message.wamid,
      direction: message.direction,
      type: message.type,
      text: message.text,
      sentAt: message.sentAt,
    }).from(message)
      .where(and(eq(message.conversationId, conversationId), eq(message.tenantId, scope.tenantId)))
      .orderBy(asc(message.sentAt), asc(message.id));
  },
});
