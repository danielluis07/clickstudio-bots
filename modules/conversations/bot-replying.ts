import { and, eq, gt, sql, type SQL } from "drizzle-orm";
import { channel, conversation, message, organization } from "@/db/schema";

// The Bot may reply in a Conversation only while it owns it and its Channel is
// activated, unpaused, subscribed and healthy. The reply gate reads this and
// the reservation fences on it, so both always agree. An unhealthy Channel
// leaves its Conversations with the Bot, which resumes once it is healthy:
// Members could not send from it either (#145).
export const botEligible = sql`(${conversation.owner} = 'bot' and exists(
  select 1 from ${channel} where ${channel.id} = ${conversation.channelId}
  and ${channel.botEnabled} and not ${channel.botPaused} and ${channel.subscriptionStatus} = 'subscribed'
  and ${channel.health} = 'healthy'
  and exists(select 1 from ${organization} where ${organization.id} = ${channel.tenantId}
    and ${organization.canceledAt} is null)
))`;

// How long the inbox shows the Bot replying after a Contact message: about
// the worst case of a burst wait and a turn retried after transient Model
// failures (#228), so a lost or failed turn never leaves it shown.
export const botReplyingMs = 60_000;

// Until when the inbox shows the Bot replying in the row's Conversation (#229):
// while the Bot may reply, from the latest Contact message no Bot turn has
// answered, handed off or skipped, for `botReplyingMs`. Null when nothing is
// pending. The browser hides it at that time, with no further update. The
// subquery's own `message` shadows any joined one.
export const botReplyingUntil = (scope: { tenantId: string }) =>
  sql`case when ${botEligible} then (
    select max(${message.sentAt}) + make_interval(secs => ${botReplyingMs / 1000})
    from ${message}
    where ${and(
      eq(message.tenantId, scope.tenantId),
      eq(message.conversationId, conversation.id),
      eq(message.origin, "contact"),
      eq(message.imported, false),
      eq(message.botAnswered, false),
      gt(message.sentAt, sql`coalesce(${conversation.botSkippedAt}, '-infinity'::timestamptz)`),
    )}
  ) end`.mapWith(message.sentAt) as SQL<Date | null>;
