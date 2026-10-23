import { and, asc, count, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { channel, conversation, message, organization } from "@/db/schema";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import type { TenantScope } from "@/modules/tenancy";
import { resolveUnresolvedEchoes } from "@/modules/conversations/echoes";
import {
  handOff,
  unansweredContactMessages,
  type ConversationHandoffReason,
} from "@/modules/conversations/handoff";
import {
  createConversationRepository,
  serviceWindowHours,
} from "@/modules/conversations/repository";

export const botLeaseMs = 120_000;

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

// The Bot may reply in a Conversation only while it owns it and its Channel is
// activated, unpaused and subscribed. The reply gate reads this and the
// reservation fences on it, so both always agree.
const botEligible = sql`(${conversation.owner} = 'bot' and exists(
  select 1 from ${channel} where ${channel.id} = ${conversation.channelId}
  and ${channel.botEnabled} and not ${channel.botPaused} and ${channel.subscriptionStatus} = 'subscribed'
  and exists(select 1 from ${organization} where ${organization.id} = ${channel.tenantId}
    and ${organization.canceledAt} is null)
))`;

// WhatsApp's service window for the Bot, opened by the Contact's latest live
// message. Imported history never reopens it.
const serviceWindowOpen = (now: Date) => sql`exists(
  select 1 from ${message} where ${message.conversationId} = ${conversation.id}
  and ${message.origin} = 'contact' and not ${message.imported}
  and ${message.sentAt} > ${now.toISOString()}::timestamptz - make_interval(hours => ${serviceWindowHours})
)`;

// Only verified jobs and daily maintenance call this resolver. It derives
// proof from the stored Channel phone-number-id, never a request's Tenant id.
export const resolveBotConversation = async (db: Database, conversationId: string) => {
  const [found] = await db
    .select({ phoneNumberId: channel.phoneNumberId })
    .from(conversation)
    .innerJoin(
      channel,
      and(eq(channel.id, conversation.channelId), eq(channel.tenantId, conversation.tenantId)),
    )
    .where(eq(conversation.id, conversationId));
  return found ? resolveChannelPhoneNumber(db, found.phoneNumberId) : null;
};

// A privileged global scan only. Mutations use the resolved ChannelRoute.
export const listBotRecoveryCandidates = async (db: Database, now: Date) => {
  const expired = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(lte(conversation.botLeaseUntil, now));
  const stuck = await db
    .selectDistinct({ id: message.conversationId })
    .from(message)
    .where(
      and(
        eq(message.origin, "bot"),
        eq(message.status, "pending"),
        isNull(message.wamid),
        lte(message.createdAt, new Date(now.getTime() - botLeaseMs)),
      ),
    );
  return [...new Set([...expired, ...stuck].map(({ id }) => id))];
};

export const createConversationBotRepository = (db: Database, scope: ChannelRoute) => {
  const ownsConversation = (conversationId: string) =>
    and(
      eq(conversation.id, conversationId),
      eq(conversation.tenantId, scope.tenantId),
      eq(conversation.channelId, scope.channelId),
    );
  const ownsMessages = (conversationId: string) =>
    and(
      eq(message.tenantId, scope.tenantId),
      eq(message.conversationId, conversationId),
      sql`exists(select 1 from ${conversation} where ${ownsConversation(conversationId)})`,
    );
  const unanswered = (conversationId: string) =>
    and(ownsMessages(conversationId), unansweredContactMessages(scope, conversationId));

  return {
    async load(conversationId: string) {
      const [found] = await db
        .select({
          tenantId: conversation.tenantId,
          phoneNumberId: channel.phoneNumberId,
          credential: channel.credential,
          wabaId: channel.wabaId,
        })
        .from(conversation)
        .innerJoin(
          channel,
          and(eq(channel.id, conversation.channelId), eq(channel.tenantId, conversation.tenantId)),
        )
        .where(ownsConversation(conversationId));
      if (!found) return null;
      return { ...found, scope };
    },
    // Null for a Conversation outside this Channel.
    async eligibility(conversationId: string, now: Date) {
      const [found] = await db
        .select({
          eligible: sql<boolean>`${botEligible}`,
          windowOpen: sql<boolean>`${serviceWindowOpen(now)}`,
        })
        .from(conversation)
        .where(ownsConversation(conversationId));
      return found ?? null;
    },
    async claim(conversationId: string, token: string, now: Date) {
      const claimed = await db
        .update(conversation)
        .set({ botLeaseToken: token, botLeaseUntil: new Date(now.getTime() + botLeaseMs) })
        .where(
          and(
            ownsConversation(conversationId),
            or(isNull(conversation.botLeaseUntil), lte(conversation.botLeaseUntil, now)),
          ),
        )
        .returning({ id: conversation.id });
      return claimed.length > 0;
    },
    async release(conversationId: string, token: string) {
      await db
        .update(conversation)
        .set({ botLeaseToken: null, botLeaseUntil: null })
        .where(and(ownsConversation(conversationId), eq(conversation.botLeaseToken, token)));
    },
    listUnanswered: (conversationId: string) =>
      db
        .select({ id: message.id })
        .from(message)
        .where(unanswered(conversationId))
        .orderBy(asc(message.createdAt), asc(message.id)),
    async failPending(conversationId: string, now: Date, staleOnly = false) {
      return db.transaction(async (tx) => {
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
        // A Member's earlier Handoff keeps its reason.
        await handOff(tx, scope, conversationId, "bot_indisponivel");
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
      handoffReason?: ConversationHandoffReason,
      beforeReserve?: (tx: Transaction) => Promise<void>,
    ) {
      return db.transaction(async (tx) => {
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
          .returning({ tenantId: conversation.tenantId });
        if (!valid.length) return null;
        // Resuming after a Handoff settles the backlog, possibly while this
        // turn generated its reply. A settled snapshot is never answered.
        const stillUnanswered = await tx
          .select({ id: message.id })
          .from(message)
          .where(and(unanswered(conversationId), inArray(message.id, ids)))
          .for("update");
        if (stillUnanswered.length !== ids.length) return null;
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
        if (!pending) return null;
        await tx
          .update(message)
          .set({ botAnswered: true })
          .where(and(unanswered(conversationId), inArray(message.id, ids)));
        await tx
          .update(conversation)
          .set({
            lastMessageAt: sql`greatest(${conversation.lastMessageAt}, ${now.toISOString()}::timestamptz)`,
          })
          .where(ownsConversation(conversationId));
        // Durable before Meta is called, so a crash after sending keeps it.
        if (handoffReason) await handOff(tx, scope, conversationId, handoffReason);
        return pending.id;
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
    async clearExpired(conversationId: string, now: Date) {
      return db
        .update(conversation)
        .set({ botLeaseToken: null, botLeaseUntil: null })
        .where(and(ownsConversation(conversationId), lte(conversation.botLeaseUntil, now)))
        .returning({ id: conversation.id });
    },
    async snapshot(conversationId: string) {
      const pending = await db
        .select({ id: message.id })
        .from(message)
        .where(unanswered(conversationId))
        .orderBy(asc(message.createdAt), asc(message.id));
      const reader = createConversationRepository(db, scope);
      // Read current edits/revokes for every pending Contact message, regardless
      // of the normal history page size. All queries share the caller's snapshot.
      const [history, current] = await Promise.all([
        reader.listMessages(conversationId, { limit: 50 }),
        pending.length
          ? reader.listMessages(conversationId, {
              messageIds: pending.map(({ id }) => id),
              limit: pending.length,
            })
          : null,
      ]);
      return { pending, history: history?.messages ?? [], current: current?.messages ?? [] };
    },
  };
};
