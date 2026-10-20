import { and, desc, eq, ilike, like, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database } from "@/db/database";
import { contact, conversation, message } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";

// The latest message's text, for the list preview.
const lastMessageText = sql<string | null>`(
  select ${message.text} from ${message}
  where ${message.conversationId} = ${conversation.id}
  order by ${message.sentAt} desc, ${message.id} desc
  limit 1
)`;

// Matches the Contact name a Member gave, the WhatsApp profile name, or the
// phone digits, so "(21) 98888-7777" finds 5521988887777.
const matchesSearch = (search: string) => {
  const term = search.trim();
  if (!term) return undefined;
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const digits = term.replace(/\D/g, "");
  const phoneShaped = digits && /^[\d\s()+.-]+$/.test(term);
  return or(
    ilike(contact.name, pattern),
    ilike(contact.profileName, pattern),
    phoneShaped ? like(contact.phone, `%${digits}%`) : undefined,
  );
};

export type ConversationCursor = { lastMessageAt: Date; id: string };
export type MessageCursor = { sentAt: Date; id: string };

const contactFields = {
  id: contact.id,
  phone: contact.phone,
  profileName: contact.profileName,
  name: contact.name,
};

// Rows after the cursor in (time, id) descending order. Timestamps come from
// JS dates, so millisecond precision loses nothing.
const before = (time: AnyPgColumn, id: AnyPgColumn, cursor: { at: Date; id: string } | null) =>
  cursor ? sql`(${time}, ${id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id})` : undefined;

// Fetches one row past the page to learn whether another page follows.
const toPage = <Row, Cursor>(rows: Row[], limit: number, cursorOf: (row: Row) => Cursor) => {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { page, nextCursor: hasMore ? cursorOf(page[page.length - 1]) : null };
};

// What Members see and change in the inbox: every query is bound to the
// scope's Tenant, whatever Conversation or Contact id the caller passes.
export const createConversationRepository = (db: Database, scope: TenantScope) => {
  const getConversation = async (conversationId: string) => {
    const [found] = await db.select({
      id: conversation.id,
      channelId: conversation.channelId,
      contact: contactFields,
    }).from(conversation)
      .innerJoin(contact, eq(contact.id, conversation.contactId))
      .where(and(eq(conversation.id, conversationId), eq(conversation.tenantId, scope.tenantId)));
    return found ?? null;
  };

  return {
    getConversation,

    async listConversations({ search = "", cursor = null, limit = 30 }: {
      search?: string;
      cursor?: ConversationCursor | null;
      limit?: number;
    } = {}) {
      const rows = await db.select({
        id: conversation.id,
        channelId: conversation.channelId,
        contact: contactFields,
        lastMessageAt: conversation.lastMessageAt,
        lastMessageText,
      }).from(conversation)
        .innerJoin(contact, eq(contact.id, conversation.contactId))
        .where(and(
          eq(conversation.tenantId, scope.tenantId),
          matchesSearch(search),
          before(conversation.lastMessageAt, conversation.id, cursor && { at: cursor.lastMessageAt, id: cursor.id }),
        ))
        .orderBy(desc(conversation.lastMessageAt), desc(conversation.id))
        .limit(limit + 1);
      const { page, nextCursor } = toPage(rows, limit, (row): ConversationCursor => ({ lastMessageAt: row.lastMessageAt, id: row.id }));
      return { conversations: page, nextCursor };
    },

    // The latest messages in the order they were sent; the cursor pages back to
    // older ones. Null when the Conversation is not the Tenant's.
    async listMessages(conversationId: string, { cursor = null, limit = 50 }: {
      cursor?: MessageCursor | null;
      limit?: number;
    } = {}) {
      if (!await getConversation(conversationId)) return null;
      const rows = await db.select({
        id: message.id,
        wamid: message.wamid,
        direction: message.direction,
        type: message.type,
        text: message.text,
        sentAt: message.sentAt,
      }).from(message)
        .where(and(
          eq(message.conversationId, conversationId),
          eq(message.tenantId, scope.tenantId),
          before(message.sentAt, message.id, cursor && { at: cursor.sentAt, id: cursor.id }),
        ))
        .orderBy(desc(message.sentAt), desc(message.id))
        .limit(limit + 1);
      const { page, nextCursor } = toPage(rows, limit, (row): MessageCursor => ({ sentAt: row.sentAt, id: row.id }));
      return { messages: page.reverse(), nextCursor };
    },

    // A blank name clears it, so the WhatsApp profile name shows again. Null
    // when the Contact is not the Tenant's.
    async renameContact(contactId: string, name: string) {
      const [renamed] = await db.update(contact)
        .set({ name: name.trim() || null })
        .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)))
        .returning(contactFields);
      return renamed ?? null;
    },
  };
};
