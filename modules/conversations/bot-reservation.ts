import { and, count, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { conversation, message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { botEligible } from "@/modules/conversations/bot-eligibility";
import { botLeaseMs, botOwnership } from "@/modules/conversations/bot-lease";
import { resolveUnresolvedEchoes } from "@/modules/conversations/echoes";
import {
  handOff,
  type ConversationHandoffReason,
  type ConversationPendingHandoff,
} from "@/modules/conversations/handoff";
import { serviceWindowOpen } from "@/modules/conversations/repository";
import type { TenantScope } from "@/modules/tenancy";
import type { AlertPing } from "@/platform/notifier";

// Tenant-wide durable reservations that may still become acknowledged replies.
// Read under the allowance counter's lock, in the send reservation transaction.
export const countPendingBotReplies = async (
  tx: Transaction,
  scope: ChannelRoute | TenantScope,
  now: Date,
) => {
  const [pending] = await tx
    .select({ total: count() })
    .from(message)
    .where(
      and(
        eq(message.tenantId, scope.tenantId),
        eq(message.origin, "bot"),
        eq(message.direction, "outbound"),
        eq(message.type, "text"),
        eq(message.imported, false),
        eq(message.status, "pending"),
        isNull(message.wamid),
        gt(message.createdAt, new Date(now.getTime() - botLeaseMs)),
      ),
    );
  return pending!.total;
};

// Bot replies sent at or after `since` to the Contact of the Conversation,
// across that Contact's Conversations, for the daily reply cap. Pending sends
// count, since they may still reach the Contact; failed ones do not. A reply
// before a Member last returned its Conversation to the Bot does not count.
// Read in the reservation transaction, the Conversation's lease and row lock
// make the count exact for that Conversation.
export const countContactBotReplies = async (
  db: Database | Transaction,
  scope: ChannelRoute | TenantScope,
  conversationId: string,
  since: Date,
) => {
  const turnContact = db
    .select({ contactId: conversation.contactId })
    .from(conversation)
    .where(and(eq(conversation.id, conversationId), eq(conversation.tenantId, scope.tenantId)));
  const [replies] = await db
    .select({ total: count() })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(
      and(
        eq(message.tenantId, scope.tenantId),
        eq(conversation.tenantId, scope.tenantId),
        inArray(conversation.contactId, turnContact),
        eq(message.origin, "bot"),
        eq(message.imported, false),
        ne(message.status, "failed"),
        gte(message.sentAt, since),
        or(
          isNull(conversation.returnedByMemberAt),
          gt(message.sentAt, conversation.returnedByMemberAt),
        ),
      ),
    );
  return replies!.total;
};

// A reservation that lost its race: its transaction rolls back, Handoff included.
class ReservationConflict extends Error {}

// Handoffs it writes add the Alerts they raise to `alerts` once their
// transaction has committed, for the caller to announce.
export const createBotReservation = (db: Database, scope: ChannelRoute, alerts?: AlertPing[]) => {
  const transactionRaising = async <T>(
    work: (tx: Transaction, raised: AlertPing[]) => Promise<T>,
  ) => {
    const raised: AlertPing[] = [];
    const result = await db.transaction((tx) => work(tx, raised));
    alerts?.push(...raised);
    return result;
  };
  const { ownsConversation, ownsMessages, unanswered } = botOwnership(scope);

  return {
    async failPending(conversationId: string, now: Date, staleOnly = false) {
      return transactionRaising(async (tx, raised) => {
        // Serialize only these local writes with reservation and cleanup.
        const locked = await tx
          .select({ id: conversation.id })
          .from(conversation)
          .where(
            and(
              ownsConversation(conversationId),
              staleOnly
                ? or(isNull(conversation.botLeaseUntil), lte(conversation.botLeaseUntil, now))
                : undefined,
            ),
          )
          .for("update");
        if (!locked.length) return false;
        const failed = await tx
          .update(message)
          .set({ status: "failed" })
          .where(
            and(
              ownsMessages(conversationId),
              eq(message.origin, "bot"),
              eq(message.status, "pending"),
              isNull(message.wamid),
              staleOnly ? lte(message.createdAt, new Date(now.getTime() - botLeaseMs)) : undefined,
            ),
          )
          .returning({ id: message.id });
        if (!failed.length) return false;
        // A failed notice never reached the Contact; the next one is sent.
        await tx
          .update(conversation)
          .set({ unavailableNoticeSent: false })
          .where(ownsConversation(conversationId));
        // A Member's earlier Handoff keeps its reason.
        await handOff(tx, scope, conversationId, "bot_unavailable", { alerts: raised });
        // Now with the team, whatever those echoes were.
        await resolveUnresolvedEchoes(tx, scope.tenantId, conversationId, { handOff: false });
        return true;
      });
    },
    async reserve(
      conversationId: string,
      token: string,
      ids: string[],
      text: string,
      now: Date,
      {
        handoffReason,
        pendingHandoff,
        beforeReserve,
      }: {
        handoffReason?: ConversationHandoffReason;
        // The model's Handoff this reply puts off to ask for required details.
        pendingHandoff?: ConversationPendingHandoff;
        beforeReserve?: (tx: Transaction) => Promise<void>;
      } = {},
    ) {
      return transactionRaising(async (tx, raised) => {
        // Fencing check and eligibility in one update; the lease is never a DB lock.
        const valid = await tx
          .update(conversation)
          .set({ botLeaseUntil: new Date(now.getTime() + botLeaseMs) })
          .where(
            and(
              ownsConversation(conversationId),
              eq(conversation.botLeaseToken, token),
              gt(conversation.botLeaseUntil, now),
              botEligible,
              serviceWindowOpen(now),
            ),
          )
          .returning({
            tenantId: conversation.tenantId,
            unavailableNoticeSent: conversation.unavailableNoticeSent,
          });
        if (!valid.length) return null;
        // Resuming after a Handoff settles the backlog, possibly while this
        // turn generated its reply. A settled snapshot is never answered.
        const stillUnanswered = await tx
          .select({ id: message.id })
          .from(message)
          .where(and(unanswered(conversationId), inArray(message.id, ids)))
          .for("update");
        if (stillUnanswered.length !== ids.length) return null;
        // The Contact already has the unavailability notice, and no turn has
        // succeeded nor a Member acted since. Hand off again without a second
        // notice or a spent Bot reply. The snapshot stays unanswered: the
        // Contact's next message returns it to the Bot with the rest.
        if (handoffReason === "bot_unavailable" && valid[0].unavailableNoticeSent) {
          await handOff(tx, scope, conversationId, handoffReason, { alerts: raised });
          return { withheld: true } as const;
        }
        // Durable before Meta is called, so a crash after sending keeps it.
        // Before `beforeReserve`, which takes the reply usage row: the
        // Handoff's Alert rows rank below it (docs/locking.md).
        if (handoffReason)
          await handOff(tx, scope, conversationId, handoffReason, { alerts: raised });
        await beforeReserve?.(tx);
        const [pending] = await tx
          .insert(message)
          .values({
            tenantId: valid[0].tenantId,
            conversationId,
            direction: "outbound",
            origin: "bot",
            status: "pending",
            answeredMessageId: ids.at(-1)!,
            type: "text",
            text,
            sentAt: now,
            createdAt: now,
          })
          .onConflictDoNothing({ target: [message.conversationId, message.answeredMessageId] })
          .returning({ id: message.id });
        if (!pending) throw new ReservationConflict();
        await tx
          .update(message)
          .set({ botAnswered: true })
          .where(and(unanswered(conversationId), inArray(message.id, ids)));
        await tx
          .update(conversation)
          .set({
            lastMessageAt: sql`greatest(${conversation.lastMessageAt}, ${now.toISOString()}::timestamptz)`,
            // Any other reply means the Model answered again.
            unavailableNoticeSent: handoffReason === "bot_unavailable",
            // Any other reply settles a pending Handoff; a Handoff already did.
            pendingHandoffReason: pendingHandoff ?? null,
          })
          .where(ownsConversation(conversationId));
        return pending.id;
      }).catch((error: unknown) => {
        if (error instanceof ReservationConflict) return null;
        throw error;
      });
    },
    async consume(conversationId: string, token: string, ids: string[], now: Date) {
      await db
        .update(message)
        .set({ botAnswered: true })
        .where(
          and(
            unanswered(conversationId),
            inArray(message.id, ids),
            sql`exists(select 1 from ${conversation} where ${ownsConversation(conversationId)} and ${conversation.botLeaseToken} = ${token} and ${conversation.botLeaseUntil} > ${now.toISOString()}::timestamptz)`,
          ),
        );
    },
  };
};
