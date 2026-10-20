import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact, conversation, message } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";
import { contactDetailsSchema, type ContactDetails } from "@/modules/conversations/contact-details";

const contactName = sql<string | null>`coalesce(${contact.name}, ${contact.profileName})`;

// Member reads of Conversations: every query is bound to the scope's Tenant,
// whatever Conversation id the caller passes.
export const createConversationRepository = (db: Database, scope: TenantScope) => ({
  async listConversations({ search = "" }: { search?: string } = {}) {
    const term = search.trim();
    const namePattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    const phoneTerm = /^[+\d\s().-]+$/.test(term) ? term.replace(/\D/g, "") : "";
    const latestMessage = db.select({ text: message.text, sentAt: message.sentAt }).from(message)
      .where(and(eq(message.conversationId, conversation.id), eq(message.tenantId, scope.tenantId)))
      .orderBy(desc(message.sentAt), desc(message.id)).limit(1).as("latest_message");
    return db.select({
      id: conversation.id,
      channelId: conversation.channelId,
      contactId: contact.id,
      contactPhone: contact.phone,
      contactProfileName: contact.profileName,
      contactName,
      lastMessageText: latestMessage.text,
      lastMessageAt: latestMessage.sentAt,
    }).from(conversation)
      .innerJoin(contact, and(eq(contact.id, conversation.contactId), eq(contact.tenantId, scope.tenantId)))
      .leftJoinLateral(latestMessage, sql`true`)
      .where(and(
        eq(conversation.tenantId, scope.tenantId),
        term ? or(ilike(contactName, namePattern), phoneTerm ? ilike(contact.phone, `%${phoneTerm}%`) : undefined) : undefined,
      ))
      .orderBy(desc(sql`coalesce(${latestMessage.sentAt}, ${conversation.createdAt})`), desc(conversation.id));
  },

  async getConversation(conversationId: string) {
    const [found] = await db.select({
      id: conversation.id,
      channelId: conversation.channelId,
      contact: { id: contact.id, name: contactName, phone: contact.phone },
    }).from(conversation)
      .innerJoin(contact, and(eq(contact.id, conversation.contactId), eq(contact.tenantId, scope.tenantId)))
      .where(and(eq(conversation.id, conversationId), eq(conversation.tenantId, scope.tenantId))).limit(1);
    return found ?? null;
  },

  async updateContact(contactId: string, input: ContactDetails) {
    const parsed = contactDetailsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" } as const;
    const [updated] = await db.update(contact).set(parsed.data)
      .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)))
      .returning({ id: contact.id });
    return updated ? { ok: true } as const : { ok: false, error: "not_found" } as const;
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

type ConversationRepository = ReturnType<typeof createConversationRepository>;
export type ConversationDetails = NonNullable<Awaited<ReturnType<ConversationRepository["getConversation"]>>>;
export type ConversationMessage = Awaited<ReturnType<ConversationRepository["listMessages"]>>[number];
