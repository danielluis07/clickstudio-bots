import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, conversation, message } from "@/db/schema";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import { unansweredContactMessages } from "@/modules/conversations/handoff";

export const botLeaseMs = 120_000;

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

// The rows of one Conversation a Bot turn may touch, all within the Channel.
export const botOwnership = (scope: ChannelRoute) => {
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
  return { ownsConversation, ownsMessages, unanswered };
};

// The Bot lease: one turn per Conversation, across the Model call and the
// send. `claim` is one conditional update, `reserve` renews it, `release`
// ends it, and `clearExpired` ends one a crash left behind.
export const createBotLease = (db: Database, scope: ChannelRoute) => {
  const { ownsConversation } = botOwnership(scope);

  return {
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
    // Fenced like `consume`: a turn whose lease expired records nothing.
    async markSkipped(conversationId: string, token: string, now: Date) {
      const skipped = await db
        .update(conversation)
        .set({ botSkippedAt: now })
        .where(
          and(
            ownsConversation(conversationId),
            eq(conversation.botLeaseToken, token),
            gt(conversation.botLeaseUntil, now),
          ),
        )
        .returning({ id: conversation.id });
      return skipped.length > 0;
    },
    async clearExpired(conversationId: string, now: Date) {
      return db
        .update(conversation)
        .set({ botLeaseToken: null, botLeaseUntil: null })
        .where(and(ownsConversation(conversationId), lte(conversation.botLeaseUntil, now)))
        .returning({ id: conversation.id });
    },
  };
};
