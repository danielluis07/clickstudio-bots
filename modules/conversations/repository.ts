import { and, desc, eq, ilike, like, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database } from "@/db/database";
import { contact, conversation, member, message, messageChange, user } from "@/db/schema";
import { recordSentWamid } from "@/modules/conversations/echoes";
import type { TenantScope } from "@/modules/tenancy";

// Matches the Contact name a Member gave, the name saved in the WhatsApp
// Business app, the WhatsApp profile name, or the phone digits, so
// "(21) 98888-7777" finds 5521988887777.
const matchesSearch = (search: string) => {
  const term = search.trim();
  if (!term) return undefined;
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const digits = term.replace(/\D/g, "");
  const phoneShaped = digits && /^[\d\s()+.-]+$/.test(term);
  return or(
    ilike(contact.name, pattern),
    ilike(contact.appName, pattern),
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
  appName: contact.appName,
  name: contact.name,
};

// WhatsApp lets a business reply freely for 24 hours after the Contact's
// latest message.
const serviceWindowHours = 24;

// The message's changes of one kind, matched by its wamid and direction.
const changesOf = (
  kind: (typeof messageChange.kind.enumValues)[number],
) => sql`from ${messageChange}
  where ${messageChange.tenantId} = ${message.tenantId} and ${messageChange.originalWamid} = ${message.wamid}
    and ${messageChange.direction} = ${message.direction} and ${messageChange.kind} = ${kind}`;

const latestEditText = sql`(select ${messageChange.text} ${changesOf("edit")}
  order by ${messageChange.changedAt} desc, ${messageChange.wamid} desc limit 1)`;

// A subquery's timestamp, null when no change matches.
const nullableTime = (query: SQL) => query.mapWith(message.sentAt) as SQL<Date | null>;

const editedAt = nullableTime(sql`(select max(${messageChange.changedAt}) ${changesOf("edit")})`);
const revokedAt = nullableTime(
  sql`(select min(${messageChange.changedAt}) ${changesOf("revoke")})`,
);

// Rows after the cursor in (time, id) descending order. Timestamps come from
// JS dates, so millisecond precision loses nothing.
const before = (time: AnyPgColumn, id: AnyPgColumn, cursor: { at: Date; id: string } | null) =>
  cursor
    ? sql`(${time}, ${id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id})`
    : undefined;

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
    const [found] = await db
      .select({
        id: conversation.id,
        channelId: conversation.channelId,
        contact: contactFields,
        // Null until the Contact has written; the window never opens otherwise.
        serviceWindowClosesAt: sql`(
        select max(${message.sentAt}) + make_interval(hours => ${serviceWindowHours}) from ${message}
        where ${message.conversationId} = ${conversation.id} and ${message.direction} = 'inbound'
      )`.mapWith(message.sentAt),
      })
      .from(conversation)
      .innerJoin(contact, eq(contact.id, conversation.contactId))
      .where(and(eq(conversation.id, conversationId), eq(conversation.tenantId, scope.tenantId)));
    return found ?? null;
  };

  return {
    getConversation,

    async listConversations({
      search = "",
      cursor = null,
      limit = 30,
    }: {
      search?: string;
      cursor?: ConversationCursor | null;
      limit?: number;
    } = {}) {
      const rows = await db
        .select({
          id: conversation.id,
          channelId: conversation.channelId,
          contact: contactFields,
          lastMessageAt: conversation.lastMessageAt,
        })
        .from(conversation)
        .innerJoin(contact, eq(contact.id, conversation.contactId))
        .where(
          and(
            eq(conversation.tenantId, scope.tenantId),
            matchesSearch(search),
            before(
              conversation.lastMessageAt,
              conversation.id,
              cursor && { at: cursor.lastMessageAt, id: cursor.id },
            ),
          ),
        )
        .orderBy(desc(conversation.lastMessageAt), desc(conversation.id))
        .limit(limit + 1);
      const { page, nextCursor } = toPage(rows, limit, (row): ConversationCursor => ({
        lastMessageAt: row.lastMessageAt,
        id: row.id,
      }));
      return { conversations: page, nextCursor };
    },

    // The latest messages in the order they were sent; the cursor pages back to
    // older ones. Null when the Conversation is not the Tenant's.
    async listMessages(
      conversationId: string,
      {
        cursor = null,
        limit = 50,
      }: {
        cursor?: MessageCursor | null;
        limit?: number;
      } = {},
    ) {
      if (!(await getConversation(conversationId))) return null;
      const rows = await db
        .select({
          id: message.id,
          wamid: message.wamid,
          direction: message.direction,
          origin: message.origin,
          // Null for the Contact's messages and once the author is removed.
          authorName: user.name,
          status: message.status,
          type: message.type,
          // As last edited; a revoked message shows no text.
          text: sql<
            string | null
          >`case when ${revokedAt} is null then coalesce(${latestEditText}, ${message.text}) end`,
          sentAt: message.sentAt,
          imported: message.imported,
          editedAt,
          revokedAt,
        })
        .from(message)
        .leftJoin(member, eq(member.id, message.authorMemberId))
        .leftJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(message.conversationId, conversationId),
            eq(message.tenantId, scope.tenantId),
            before(message.sentAt, message.id, cursor && { at: cursor.sentAt, id: cursor.id }),
          ),
        )
        .orderBy(desc(message.sentAt), desc(message.id))
        .limit(limit + 1);
      const { page, nextCursor } = toPage(rows, limit, (row): MessageCursor => ({
        sentAt: row.sentAt,
        id: row.id,
      }));
      return { messages: page.reverse(), nextCursor };
    },

    // Stores the scope's Member's reply before it is sent, so a send that
    // fails or never answers still shows in the Conversation.
    async insertPendingReply(
      conversationId: string,
      { text, sentAt }: { text: string; sentAt: Date },
    ) {
      return db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(message)
          .values({
            tenantId: scope.tenantId,
            conversationId,
            direction: "outbound",
            origin: "dashboard",
            authorMemberId: scope.memberId,
            status: "pending",
            type: "text",
            text,
            sentAt,
          })
          .returning({ id: message.id });
        await tx
          .update(conversation)
          .set({
            lastMessageAt: sql`greatest(${conversation.lastMessageAt}, ${sentAt.toISOString()}::timestamptz)`,
          })
          .where(
            and(eq(conversation.id, conversationId), eq(conversation.tenantId, scope.tenantId)),
          );
        return inserted;
      });
    },

    // Meta's wamid lets delivery statuses find the reply; without one the
    // send failed.
    async recordReplySent(messageId: string, sent: { wamid: string } | null) {
      if (sent) return recordSentWamid(db, scope.tenantId, messageId, sent.wamid);
      await db
        .update(message)
        .set({ status: "failed" })
        .where(and(eq(message.id, messageId), eq(message.tenantId, scope.tenantId)));
    },

    // A blank name clears it, so the WhatsApp profile name shows again. Null
    // when the Contact is not the Tenant's.
    async renameContact(contactId: string, name: string) {
      const [renamed] = await db
        .update(contact)
        .set({ name: name.trim() || null })
        .where(and(eq(contact.id, contactId), eq(contact.tenantId, scope.tenantId)))
        .returning(contactFields);
      return renamed ?? null;
    },
  };
};
