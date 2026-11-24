import { and, count, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { alert, alertKinds, contact, conversation, member, message } from "@/db/schema";
import { currentText, revokedAt } from "@/modules/conversations/message-text";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import type { AlertPing } from "@/platform/notifier";

export type AlertKind = (typeof alertKinds)[number];

// How many Alerts the bell lists, newest first.
export const alertListLimit = 50;

// Alerts are deleted this long after their latest event (ADR 0010).
export const alertRetentionDays = 30;

// The Conversation's latest live Contact message, which the bell previews.
const latestContactMessage = (tenantId: string, conversationId: string) =>
  sql<string | null>`(select ${message.id} from ${message}
    where ${message.tenantId} = ${tenantId} and ${message.conversationId} = ${conversationId}
      and ${message.origin} = 'contact' and not ${message.imported}
    order by ${message.sentAt} desc, ${message.id} desc limit 1)`;

// Raises an Alert of `kind` about the Conversation for every Member of the
// Tenant, in the caller's transaction, which must already hold the
// Conversation row (docs/locking.md#alerts). Until Alert preferences exist,
// every Member has every kind on. A Member's unread Alert of the same kind for
// the Conversation absorbs the event and counts it, unless it already merged
// this `eventKey`, so a retried job or Bot turn raises nothing twice. Returns
// what the caller announces after commit.
export const raiseAlerts = async (
  tx: Transaction,
  scope: { tenantId: string },
  conversationId: string,
  kind: AlertKind,
  eventKey: string,
): Promise<AlertPing[]> => {
  const members = await tx
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, scope.tenantId));
  if (members.length === 0) return [];
  return tx
    .insert(alert)
    .values(
      members.map(({ id }) => ({
        tenantId: scope.tenantId,
        memberId: id,
        conversationId,
        kind,
        eventKey,
        messageId: latestContactMessage(scope.tenantId, conversationId),
      })),
    )
    .onConflictDoUpdate({
      target: [alert.memberId, alert.conversationId, alert.kind],
      targetWhere: isNull(alert.readAt),
      set: {
        count: sql`${alert.count} + 1`,
        eventKey: sql`excluded.event_key`,
        messageId: sql`excluded.message_id`,
        raisedAt: sql`now()`,
      },
      setWhere: sql`${alert.eventKey} <> excluded.event_key`,
    })
    .returning({ memberId: alert.memberId, alertId: alert.id });
};

// One Member's own Alerts: every query is bound to the scope's Tenant and
// Member, whatever Conversation id the caller passes.
export const createMemberAlerts = (
  { db, clock }: { db: Database; clock: Clock },
  scope: TenantScope,
) => {
  const ownAlerts = and(eq(alert.tenantId, scope.tenantId), eq(alert.memberId, scope.memberId));
  return {
    // The newest Alerts and how many are unread in all.
    async list() {
      const rows = await db
        .select({
          id: alert.id,
          kind: alert.kind,
          count: alert.count,
          readAt: alert.readAt,
          conversationId: alert.conversationId,
          contact: {
            phone: contact.phone,
            profileName: contact.profileName,
            appName: contact.appName,
            name: contact.name,
          },
          messageType: message.type,
          messageText: currentText,
          revokedAt,
          raisedAt: alert.raisedAt,
        })
        .from(alert)
        .innerJoin(
          conversation,
          and(eq(conversation.id, alert.conversationId), eq(conversation.tenantId, scope.tenantId)),
        )
        .innerJoin(contact, eq(contact.id, conversation.contactId))
        .leftJoin(
          message,
          and(eq(message.id, alert.messageId), eq(message.tenantId, scope.tenantId)),
        )
        .where(ownAlerts)
        .orderBy(desc(alert.raisedAt), desc(alert.id))
        .limit(alertListLimit);
      const [{ unread }] = await db
        .select({ unread: count() })
        .from(alert)
        .where(and(ownAlerts, isNull(alert.readAt)));
      return {
        unread,
        alerts: rows.map(({ readAt, messageType, messageText, revokedAt, ...row }) => ({
          id: row.id,
          kind: row.kind,
          count: row.count,
          read: readAt !== null,
          conversationId: row.conversationId,
          // Every Channel is a WhatsApp number for now.
          channel: "whatsapp" as const,
          contact: row.contact,
          preview: messageType
            ? { type: messageType, text: messageText, revoked: revokedAt !== null }
            : null,
          raisedAt: row.raisedAt,
        })),
      };
    },

    // Opening a Conversation, by any route, reads its Alerts.
    async markConversationRead(conversationId: string) {
      await db
        .update(alert)
        .set({ readAt: clock.now() })
        .where(and(ownAlerts, eq(alert.conversationId, conversationId), isNull(alert.readAt)));
    },

    // "Limpar tudo": deletes the Member's own Alerts, read or not.
    async clear() {
      await db.delete(alert).where(ownAlerts);
    },
  };
};

export type MemberAlerts = ReturnType<typeof createMemberAlerts>;

// Run by the daily cron: Alerts whose latest event is older than the
// retention period, across every Tenant.
export const pruneAlerts = async (db: Database, clock: Clock) => {
  const cutoff = new Date(clock.now().getTime() - alertRetentionDays * 24 * 60 * 60 * 1000);
  await db.delete(alert).where(lt(alert.raisedAt, cutoff));
};
