import { and, eq, gt, sql, type SQL } from "drizzle-orm";
import { conversation, message } from "@/db/schema";
import { botEligible } from "@/modules/conversations/bot-eligibility";

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
