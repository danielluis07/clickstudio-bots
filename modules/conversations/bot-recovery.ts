import { and, asc, eq, gt, isNull, lte, max, min, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { conversation, message, organization } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { botEligible } from "@/modules/conversations/bot-eligibility";
import {
  botLeaseMs,
  createBotLease,
  resolveBotConversation,
} from "@/modules/conversations/bot-lease";
import { createBotReservation } from "@/modules/conversations/bot-reservation";
import type { BotTurnDependencies } from "@/modules/conversations/bot-turns";
import { serviceWindowOpen } from "@/modules/conversations/repository";
import { notifyAlerts, notifyInbox, type AlertPing } from "@/platform/notifier";

// Bounds each recovery scan; the next sweep continues where it stopped.
const recoveryBatch = 100;

// A canceled Tenant resolves no ChannelRoute, so recovery could never clear
// its leases; left in the scan, they would fill every batch.
const tenantActive = (tenantId: typeof conversation.tenantId | typeof message.tenantId) =>
  sql`not exists(select 1 from ${organization} where ${organization.id} = ${tenantId}
    and ${organization.canceledAt} is not null)`;

// A privileged global scan only, oldest first. Mutations use the resolved
// ChannelRoute.
const listBotRecoveryCandidates = async (db: Database, now: Date) => {
  const expired = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(lte(conversation.botLeaseUntil, now), tenantActive(conversation.tenantId)))
    .orderBy(asc(conversation.botLeaseUntil))
    .limit(recoveryBatch);
  const stuck = await db
    .select({ id: message.conversationId })
    .from(message)
    .where(
      and(
        eq(message.origin, "bot"),
        eq(message.status, "pending"),
        isNull(message.wamid),
        lte(message.createdAt, new Date(now.getTime() - botLeaseMs)),
        tenantActive(message.tenantId),
      ),
    )
    .groupBy(message.conversationId)
    .orderBy(asc(min(message.createdAt)))
    .limit(recoveryBatch);
  return [...new Set([...expired, ...stuck].map(({ id }) => id))];
};

// The sweep's privileged global scan for Contact messages whose Bot job never
// ran: Bot-eligible Conversations with an open service window and no live
// lease, whose newest unanswered Contact message was sent after `sentAfter`
// and no later than `sentBy`, outside the Tenants and Conversations in
// `except`. Oldest first, each with the ChannelRoute its turn resolves from
// the stored Channel.
export const listStrandedBotConversations = async (
  db: Database,
  now: Date,
  {
    sentAfter,
    sentBy,
    limit,
    except = {},
  }: {
    sentAfter: Date;
    sentBy: Date;
    limit: number;
    except?: { tenantIds?: string[]; conversationIds?: string[] };
  },
) => {
  const found = await db
    .select({ id: message.conversationId })
    .from(message)
    .innerJoin(
      conversation,
      and(eq(conversation.id, message.conversationId), eq(conversation.tenantId, message.tenantId)),
    )
    .where(
      and(
        eq(message.origin, "contact"),
        eq(message.imported, false),
        eq(message.botAnswered, false),
        gt(message.sentAt, sentAfter),
        except.tenantIds?.length ? notInArray(message.tenantId, except.tenantIds) : undefined,
        except.conversationIds?.length
          ? notInArray(message.conversationId, except.conversationIds)
          : undefined,
        or(isNull(conversation.botLeaseUntil), lte(conversation.botLeaseUntil, now)),
        botEligible,
        serviceWindowOpen(now),
      ),
    )
    .groupBy(message.conversationId)
    .having(lte(max(message.sentAt), sentBy))
    .orderBy(asc(max(message.sentAt)))
    .limit(limit);
  const stranded: { scope: ChannelRoute; conversationId: string }[] = [];
  for (const { id } of found) {
    const scope = await resolveBotConversation(db, id);
    if (scope) stranded.push({ scope, conversationId: id });
  }
  return stranded;
};

// The sweep's lease recovery: fails Bot replies stranded without a wamid by a
// lease that expired, then clears the expired leases. `onRecovered` runs before a
// lease is cleared, so it stays recoverable if `onRecovered` fails. A worker
// that already claimed it has a later expiry and is never cleared here.
export const recoverStaleBotTurns = async (
  { db, clock, notifier }: BotTurnDependencies,
  onRecovered: (scope: ChannelRoute, conversationId: string) => Promise<void>,
) => {
  const now = clock.now();
  for (const conversationId of await listBotRecoveryCandidates(db, now)) {
    const scope = await resolveBotConversation(db, conversationId);
    if (!scope) continue;
    const alerts: AlertPing[] = [];
    if (await createBotReservation(db, scope, alerts).failPending(conversationId, now, true)) {
      await notifyInbox(notifier, scope.tenantId, { conversationId });
      await notifyAlerts(notifier, scope.tenantId, alerts);
    }
    await onRecovered(scope, conversationId);
    await createBotLease(db, scope).clearExpired(conversationId, now);
  }
};
