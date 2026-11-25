import { and, asc, eq, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { channel, contact, conversation, message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { botEligible } from "@/modules/conversations/bot-eligibility";
import {
  botOwnership,
  createBotLease,
  resolveBotConversation,
} from "@/modules/conversations/bot-lease";
import { createBotReservation } from "@/modules/conversations/bot-reservation";
import { recordSentWamid } from "@/modules/conversations/echoes";
import {
  handOffAndNotify,
  type ConversationHandoffReason,
  type ConversationPendingHandoff,
} from "@/modules/conversations/handoff";
import {
  createConversationRepository,
  serviceWindowOpen,
} from "@/modules/conversations/repository";
import type { WhatsAppSender } from "@/modules/conversations/whatsapp-sender";
import type { Clock } from "@/platform/clock";
import { notifyAlerts, notifyInbox, type AlertPing, type Notifier } from "@/platform/notifier";

// Handoffs it writes add the Alerts they raise to `alerts` once their
// transaction has committed, for the caller to announce.
const createConversationBotRepository = (
  db: Database,
  scope: ChannelRoute,
  alerts?: AlertPing[],
) => {
  const { ownsConversation, unanswered } = botOwnership(scope);

  return {
    ...createBotLease(db, scope),
    ...createBotReservation(db, scope, alerts),
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
    listUnanswered: (conversationId: string) =>
      db
        .select({ id: message.id })
        .from(message)
        .where(unanswered(conversationId))
        .orderBy(asc(message.createdAt), asc(message.id)),
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
      const [found] = await db
        .select({
          recipient: {
            tenantId: conversation.tenantId,
            phoneNumberId: channel.phoneNumberId,
            wabaId: channel.wabaId,
            credential: channel.credential,
            to: contact.phone,
          },
          pendingReason: conversation.pendingHandoffReason,
          pendingAt: conversation.pendingHandoffAt,
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
        recipient: found?.recipient ?? null,
        pendingHandoff:
          found?.pendingReason && found.pendingAt
            ? { reason: found.pendingReason, askedAt: found.pendingAt }
            : null,
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
  // The Handoff the Bot's latest reply put off to ask for missing required
  // Contact details, and when it asked, if any.
  readonly pendingHandoff: { reason: ConversationPendingHandoff; askedAt: Date } | null;
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
  // Leaves the snapshot unanswered on purpose, as outside the Schedule: the
  // inbox stops showing the Bot replying to it (#229).
  skip(): Promise<void>;
  // Stores the Bot reply as pending, the durable barrier before sending, and
  // returns its id. Null when the lease, eligibility, service window or
  // snapshot no longer hold. `beforeReserve` runs in the same transaction,
  // before the insert. A repeated unavailability notice is withheld: the
  // Conversation hands off as `bot_unavailable` and nothing is stored.
  reserve(
    text: string,
    options?: {
      handoffReason?: ConversationHandoffReason;
      // Kept for the next turn when the reply asks for required details.
      pendingHandoff?: ConversationPendingHandoff;
      beforeReserve?: (tx: Transaction) => Promise<void>;
    },
  ): Promise<string | { withheld: true } | null>;
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
  // Alerts the turn's Handoffs raised and has yet to announce.
  const alerts: AlertPing[] = [];
  const repository = createConversationBotRepository(db, scope, alerts);
  const token = crypto.randomUUID();
  if (!(await repository.claim(conversationId, token, clock.now()))) return "busy";
  const announce = () => notifyAlerts(notifier, scope.tenantId, alerts.splice(0));
  const notify = async () => {
    await notifyInbox(notifier, scope.tenantId, { conversationId });
    await announce();
  };
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
      snapshot: {
        current: snapshot.current,
        history: snapshot.history,
        pendingHandoff: snapshot.pendingHandoff,
      },
      recipient: snapshot.recipient,
      async consume() {
        await repository.consume(conversationId, token, ids, clock.now());
        followUp = true;
        // The inbox stops showing the Bot replying.
        await notify();
      },
      async skip() {
        if (await repository.markSkipped(conversationId, token, clock.now())) await notify();
      },
      async reserve(text, { handoffReason, pendingHandoff, beforeReserve } = {}) {
        const reserved = await repository.reserve(conversationId, token, ids, text, clock.now(), {
          handoffReason,
          pendingHandoff,
          beforeReserve,
        });
        if (reserved !== null && typeof reserved !== "string") await notify();
        // A reserved Handoff notice reaches the inbox when it is sent, but
        // its Alerts are due now.
        else await announce();
        return reserved;
      },
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
    // Anything committed before a failure is announced all the same.
    await announce();
    await repository.release(conversationId, token);
    await afterRelease?.(scope, followUp);
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
