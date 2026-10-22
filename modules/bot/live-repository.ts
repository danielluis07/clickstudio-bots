import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, conversation, message } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";

export const botLeaseMs = 120_000;

const unanswered = (conversationId: string) =>
  and(
    eq(message.conversationId, conversationId),
    eq(message.origin, "contact"),
    eq(message.imported, false),
    eq(message.botAnswered, false),
  );

export const createLiveBotRepository = (db: Database) => ({
  async load(conversationId: string) {
    const [found] = await db
      .select({
        tenantId: conversation.tenantId,
        phoneNumberId: channel.phoneNumberId,
        credential: channel.credential,
        wabaId: channel.wabaId,
        enabled: channel.botEnabled,
        paused: channel.botPaused,
        subscribed: channel.subscriptionStatus,
        owner: conversation.owner,
      })
      .from(conversation)
      .innerJoin(
        channel,
        and(eq(channel.id, conversation.channelId), eq(channel.tenantId, conversation.tenantId)),
      )
      .where(eq(conversation.id, conversationId));
    if (!found) return null;
    const scope = await resolveChannelPhoneNumber(db, found.phoneNumberId);
    return scope ? { ...found, scope } : null;
  },
  async claim(conversationId: string, token: string, now: Date) {
    const claimed = await db
      .update(conversation)
      .set({ botLeaseToken: token, botLeaseUntil: new Date(now.getTime() + botLeaseMs) })
      .where(
        and(
          eq(conversation.id, conversationId),
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
      .where(and(eq(conversation.id, conversationId), eq(conversation.botLeaseToken, token)));
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
            eq(conversation.id, conversationId),
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
            eq(message.conversationId, conversationId),
            eq(message.origin, "bot"),
            eq(message.status, "pending"),
            isNull(message.wamid),
            staleOnly ? lte(message.createdAt, new Date(now.getTime() - botLeaseMs)) : undefined,
          ),
        )
        .returning({ id: message.id });
      if (!failed.length) return false;
      await tx
        .update(conversation)
        .set({ owner: "team", handoffReason: "bot_indisponivel" })
        .where(eq(conversation.id, conversationId));
      return true;
    });
  },
  async handoff(conversationId: string, token: string, reason: string) {
    await db
      .update(conversation)
      .set({ owner: "team", handoffReason: reason })
      .where(
        and(
          eq(conversation.id, conversationId),
          eq(conversation.botLeaseToken, token),
          eq(conversation.owner, "bot"),
        ),
      );
  },
  async reserve(conversationId: string, token: string, ids: string[], text: string, now: Date) {
    return db.transaction(async (tx) => {
      // Fencing check and eligibility in one update; the lease is never a DB lock.
      const valid = await tx
        .update(conversation)
        .set({ botLeaseUntil: new Date(now.getTime() + botLeaseMs) })
        .where(
          and(
            eq(conversation.id, conversationId),
            eq(conversation.owner, "bot"),
            eq(conversation.botLeaseToken, token),
            gt(conversation.botLeaseUntil, now),
            sql`exists(select 1 from ${channel} where ${channel.id} = ${conversation.channelId} and ${channel.botEnabled} and not ${channel.botPaused} and ${channel.subscriptionStatus} = 'subscribed')`,
            sql`exists(select 1 from ${message} where ${message.conversationId} = ${conversation.id} and ${message.origin} = 'contact' and not ${message.imported} and ${message.sentAt} > ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz)`,
          ),
        )
        .returning({ tenantId: conversation.tenantId });
      if (!valid.length) return null;
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
        .where(eq(conversation.id, conversationId));
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
          sql`exists(select 1 from ${conversation} where ${conversation.id} = ${conversationId} and ${conversation.botLeaseToken} = ${token} and ${conversation.botLeaseUntil} > ${now.toISOString()}::timestamptz)`,
        ),
      );
  },
  async sent(messageId: string) {
    await db
      .update(message)
      .set({ status: "sent" })
      .where(and(eq(message.id, messageId), eq(message.status, "pending")));
  },
  async clearExpired(now: Date) {
    return db
      .update(conversation)
      .set({ botLeaseToken: null, botLeaseUntil: null })
      .where(lte(conversation.botLeaseUntil, now))
      .returning({ id: conversation.id });
  },
  stuck: (now: Date) =>
    db
      .selectDistinct({ conversationId: message.conversationId })
      .from(message)
      .where(
        and(
          eq(message.origin, "bot"),
          eq(message.status, "pending"),
          isNull(message.wamid),
          lte(message.createdAt, new Date(now.getTime() - botLeaseMs)),
        ),
      ),
});
