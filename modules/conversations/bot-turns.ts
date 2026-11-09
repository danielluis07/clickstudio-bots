import { and, asc, count, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { channel, contact, conversation, message, organization } from "@/db/schema";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import type { TenantScope } from "@/modules/tenancy";
import { recordSentWamid, resolveUnresolvedEchoes } from "@/modules/conversations/echoes";
import {
  handOff,
  handOffAndNotify,
  unansweredContactMessages,
  type ConversationHandoffReason,
} from "@/modules/conversations/handoff";
import {
  createConversationRepository,
  serviceWindowHours,
} from "@/modules/conversations/repository";
import type { WhatsAppSender } from "@/modules/conversations/whatsapp-sender";
import type { Clock } from "@/platform/clock";
import { notifyInbox, type Notifier } from "@/platform/notifier";

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
const resolveBotConversation = async (db: Database, conversationId: string) => {
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
const listBotRecoveryCandidates = async (db: Database, now: Date) => {
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

const createConversationBotRepository = (db: Database, scope: ChannelRoute) => {
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
      // of the normal history page size. All queries share the caller's snapshot,
      // a transaction on one pg client, so they run sequentially.
      const history = await reader.listMessages(conversationId, { limit: 50 });
      const current = pending.length
        ? await reader.listMessages(conversationId, {
            messageIds: pending.map(({ id }) => id),
            limit: pending.length,
          })
        : null;
      const [recipient] = await db
        .select({
          tenantId: conversation.tenantId,
          phoneNumberId: channel.phoneNumberId,
          wabaId: channel.wabaId,
          credential: channel.credential,
          to: contact.phone,
        })
        .from(conversation)
        .innerJoin(
          channel,
          and(eq(channel.id, conversation.channelId), eq(channel.tenantId, conversation.tenantId)),
        )
        .innerJoin(
          contact,
          and(eq(contact.id, conversation.contactId), eq(contact.tenantId, conversation.tenantId)),
        )
        .where(ownsConversation(conversationId));
      return {
        pending,
        history: history?.messages ?? [],
        current: current?.messages ?? [],
        recipient: recipient ?? null,
      };
    },
  };
};

type BotTurnRepository = ReturnType<typeof createConversationBotRepository>;

// A message as a Bot turn sees it: as last edited, with no text once revoked.
export type BotTurnMessage = Awaited<ReturnType<BotTurnRepository["snapshot"]>>["history"][number];

// What a Bot turn answers, frozen before the Model call. Messages arriving
// later get their own turn.
export type BotTurnSnapshot = {
  // The unanswered Contact messages, oldest first.
  readonly current: readonly BotTurnMessage[];
  // The latest messages, oldest first. It may include the current ones.
  readonly history: readonly BotTurnMessage[];
};

export type BotTurnDependencies = { db: Database; clock: Clock; notifier: Notifier };

// One Bot turn while it holds the Conversation's lease. Every write is fenced
// by that lease and published to the inbox; the lease itself never leaves.
export type LiveBotTurn = {
  readonly scope: ChannelRoute;
  readonly conversationId: string;
  readonly snapshot: BotTurnSnapshot;
  // Where the Bot reply goes, for the WhatsApp sender.
  readonly recipient: Omit<Parameters<WhatsAppSender["sendText"]>[0], "text">;
  // Marks the snapshot answered without a Bot reply.
  consume(): Promise<void>;
  // Stores the Bot reply as pending, the durable barrier before sending. Null
  // when the lease, eligibility, service window or snapshot no longer hold.
  // `beforeReserve` runs in the same transaction, before the insert.
  reserve(
    text: string,
    options?: {
      handoffReason?: ConversationHandoffReason;
      beforeReserve?: (tx: Transaction) => Promise<void>;
    },
  ): Promise<string | null>;
  // Records the sent Bot reply's wamid. `onAcknowledged` runs in the same
  // transaction, only the first time the wamid is recorded.
  acknowledge(
    messageId: string,
    wamid: string,
    onAcknowledged?: (tx: Transaction) => Promise<void>,
  ): Promise<void>;
  // A send that failed: the pending reply fails and the team takes over.
  fail(): Promise<void>;
  handOff(reason: ConversationHandoffReason): Promise<void>;
};

// Runs one Bot turn over a Conversation's unanswered Contact messages. Only
// one runs per Conversation at a time ("busy" otherwise). A pending Bot reply
// left without a wamid by an earlier turn is never resent: it fails and hands
// off. `respond` runs only when there is something to answer. The lease is
// released whether it returns or throws, then `afterRelease` runs with whether
// the turn moved the backlog, so a later message gets its own turn.
export const runBotTurn = async <T>(
  { db, clock, notifier }: BotTurnDependencies,
  conversationId: string,
  respond: (turn: LiveBotTurn) => Promise<T>,
  afterRelease?: (scope: ChannelRoute, followUp: boolean) => Promise<void>,
): Promise<T | "busy" | "skipped" | "handoff"> => {
  const scope = await resolveBotConversation(db, conversationId);
  if (!scope) return "skipped";
  const repository = createConversationBotRepository(db, scope);
  const token = crypto.randomUUID();
  if (!(await repository.claim(conversationId, token, clock.now()))) return "busy";
  const notify = () => notifyInbox(notifier, scope.tenantId, { conversationId });
  let followUp = false;
  try {
    if (await repository.failPending(conversationId, clock.now())) {
      await notify();
      return "handoff";
    }
    const snapshot = await db.transaction(
      (tx) => createConversationBotRepository(tx, scope).snapshot(conversationId),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    const ids = snapshot.pending.map(({ id }) => id);
    if (!ids.length || !snapshot.recipient) return "skipped";
    return await respond({
      scope,
      conversationId,
      snapshot: { current: snapshot.current, history: snapshot.history },
      recipient: snapshot.recipient,
      async consume() {
        await repository.consume(conversationId, token, ids, clock.now());
        followUp = true;
      },
      reserve: (text, { handoffReason, beforeReserve } = {}) =>
        repository.reserve(
          conversationId,
          token,
          ids,
          text,
          clock.now(),
          handoffReason,
          beforeReserve,
        ),
      async acknowledge(messageId, wamid, onAcknowledged) {
        await db.transaction(async (tx) => {
          if (await recordSentWamid(tx, scope, messageId, wamid)) await onAcknowledged?.(tx);
        });
        await notify();
        followUp = true;
      },
      async fail() {
        await repository.failPending(conversationId, clock.now());
        await notify();
      },
      async handOff(reason) {
        await handOffAndNotify(db, notifier, scope, conversationId, reason, { leaseToken: token });
      },
    });
  } finally {
    await repository.release(conversationId, token);
    await afterRelease?.(scope, followUp);
  }
};

// Daily maintenance: fails Bot replies stranded without a wamid by a lease
// that expired, then clears the expired leases. `onRecovered` runs before a
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
    const repository = createConversationBotRepository(db, scope);
    if (await repository.failPending(conversationId, now, true))
      await notifyInbox(notifier, scope.tenantId, { conversationId });
    await onRecovered(scope, conversationId);
    await repository.clearExpired(conversationId, now);
  }
};

// Whether the Bot may reply in the Conversation now, and whether WhatsApp's
// service window is open. Null for a Conversation outside this Channel.
export const readBotEligibility = (
  db: Database,
  scope: ChannelRoute,
  conversationId: string,
  now: Date,
) => createConversationBotRepository(db, scope).eligibility(conversationId, now);

export const hasUnansweredContactMessages = async (
  db: Database,
  scope: ChannelRoute,
  conversationId: string,
) => (await createConversationBotRepository(db, scope).listUnanswered(conversationId)).length > 0;
