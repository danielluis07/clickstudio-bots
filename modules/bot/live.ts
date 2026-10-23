import type { Database } from "@/db/database";
import { readCapture } from "@/modules/bot/capture";
import { recordBotReplyUsage } from "@/modules/bot/allowance";
import { readLinks } from "@/modules/bot/links";
import { createBotCore } from "@/modules/bot/turn";
import { readBehaviour } from "@/modules/bot/settings";
import { createReplyGate, type BotAllowance, type ReplyDecision } from "@/modules/bot/reply-gate";
import type { Model } from "@/modules/bot/model";
import type { ContextMessage } from "@/modules/bot/repository";
import type { UsageMeter } from "@/modules/bot/usage";
import type { ChannelRoute } from "@/modules/channels";
import {
  createConversationRepository,
  handOffAndNotify,
  recordBotReplySent,
  createConversationBotRepository,
  resolveBotConversation,
  listBotRecoveryCandidates,
  readConversationContactDetails,
  saveCapturedContactDetails,
  type WhatsAppSender,
} from "@/modules/conversations";
import { readKnowledgeBase } from "@/modules/knowledge-base";
import type { Clock } from "@/platform/clock";
import { notifyInbox, type Notifier } from "@/platform/notifier";

export type BotJob = { type: "run-bot-turn"; conversationId: string };
export interface BotJobQueue {
  enqueue(jobs: readonly BotJob[]): Promise<void>;
}
export const createLiveBot = ({
  db,
  clock,
  model,
  queue,
  notifier,
  getSender,
  meter,
  allowance,
}: {
  db: Database;
  clock: Clock;
  model: Model | null;
  queue: BotJobQueue;
  notifier: Notifier;
  getSender: () => WhatsAppSender;
  meter: UsageMeter;
  allowance: BotAllowance;
}) => {
  const gate = createReplyGate({ db, clock, allowance });
  const enqueue = async (scope: ChannelRoute, conversationId: string) => {
    if ((await gate.check({ scope, conversationId }, "enqueue")).kind !== "reply") return;
    const repository = createConversationBotRepository(db, scope);
    if ((await repository.listUnanswered(conversationId)).length)
      await queue.enqueue([{ type: "run-bot-turn", conversationId }]);
  };
  return {
    enqueue,
    async run(conversationId: string) {
      const scope = await resolveBotConversation(db, conversationId);
      if (!scope) return "skipped" as const;
      const repository = createConversationBotRepository(db, scope);
      const initial = await repository.load(conversationId);
      if (!initial) return "skipped" as const;
      const token = crypto.randomUUID();
      if (!(await repository.claim(conversationId, token, clock.now()))) return "busy" as const;
      let followUp = false;
      const turn = { scope: initial.scope, conversationId };
      // Every Handoff the gate decides is fenced by this turn's lease.
      const settle = async (decision: Exclude<ReplyDecision, { kind: "reply" }>) => {
        if (decision.kind === "skip") return "skipped" as const;
        await handOffAndNotify(db, notifier, initial.scope, conversationId, decision.reason, {
          leaseToken: token,
        });
        return "handoff" as const;
      };
      try {
        if (await repository.failPending(conversationId, clock.now())) {
          await notifyInbox(notifier, initial.tenantId, { conversationId });
          return "handoff" as const;
        }
        const snapshot = await db.transaction(
          (tx) => createConversationBotRepository(tx, initial.scope).snapshot(conversationId),
          { isolationLevel: "repeatable read", accessMode: "read only" },
        );
        const pending = snapshot.pending;
        if (!pending.length) return "skipped" as const;
        const ids = pending.map(({ id }) => id);
        const reader = createConversationRepository(db, initial.scope);
        const found = await reader.getConversation(conversationId);
        if (!found) return "skipped" as const;
        // Freeze context before the Model call. Messages arriving later get their own turn.
        const history = snapshot.history;
        const contactIds = new Set(ids);
        // A Contact may write while the previous reply is being generated. Its
        // unanswered text follows that reply logically, even if sentAt is earlier.
        const replay = history.filter((row) => !contactIds.has(row.id));
        // A burst is one Contact turn. Group every unanswered text so the core's
        // bounded historical replay cannot silently discard any current question.
        const currentText = snapshot.current
          .filter((row) => !row.revokedAt)
          .map((row) => row.text ?? "")
          .filter(Boolean)
          .join("\n\n");
        if (!currentText) {
          await repository.consume(conversationId, token, ids, clock.now());
          followUp = true;
          return "skipped" as const;
        }
        const beforeModel = await gate.check(turn, "beforeModel", model !== null);
        if (beforeModel.kind !== "reply") return settle(beforeModel);
        if (!model) return "skipped" as const;
        const turnAt = new Date(
          Math.max(clock.now().getTime(), ...history.map((row) => row.sentAt.getTime())),
        );
        const core = createBotCore({
          model,
          clock,
          meter,
          repository: {
            getBehaviour: ({ scope }) => readBehaviour(db, scope),
            getKnowledgeBase: ({ scope }) => readKnowledgeBase(db, scope),
            getCapture: ({ scope }) => readCapture(db, scope),
            getLinks: ({ scope }) => readLinks(db, scope),
            getContactDetails: () =>
              readConversationContactDetails(db, initial.scope, conversationId),
            // Stored as soon as captured: the Contact stated them whether or
            // not this turn's reply is sent.
            saveContactDetails: (_turn, details) =>
              saveCapturedContactDetails({
                db,
                route: initial.scope,
                notifier,
                conversationId,
                details,
              }),
            listRecentMessages: async () => [
              ...replay
                .filter((row) => !row.revokedAt)
                .map((row): ContextMessage => ({
                  author:
                    row.origin === "contact" ? "contact" : row.origin === "bot" ? "bot" : "member",
                  text: row.text ?? "",
                  sentAt: row.sentAt,
                })),
              { author: "contact" as const, text: currentText, sentAt: turnAt },
            ],
          },
        });
        const outcome = await core.respond(turn);
        if (outcome.kind === "nothing_to_answer") {
          await repository.consume(conversationId, token, ids, clock.now());
          followUp = true;
          return "skipped" as const;
        }
        const sender = await Promise.resolve()
          .then(getSender)
          .catch(() => null);
        // Everything may have changed during the Model call.
        const beforeSend = await gate.check(turn, "beforeSend", sender !== null);
        if (beforeSend.kind !== "reply") return settle(beforeSend);
        if (!sender) return "skipped" as const;
        const messageId = await repository.reserve(
          conversationId,
          token,
          ids,
          outcome.reply,
          clock.now(),
          outcome.kind === "handoff" ? outcome.reason : undefined,
          allowance.reserve ? (tx) => allowance.reserve!(tx, turn) : undefined,
        );
        if (!messageId) return "skipped" as const;
        // A pending row is the durable send barrier. Never retry a send without a wamid.
        const sent = await sender
          .sendText({ ...initial, to: found.contact.phone, text: outcome.reply })
          .catch(() => null);
        if (!sent) {
          await repository.failPending(conversationId, clock.now());
          await notifyInbox(notifier, initial.tenantId, { conversationId });
          return "handoff" as const;
        }
        const acknowledgedAt = clock.now();
        await recordBotReplySent(db, initial.scope, messageId, sent.wamid, (tx) =>
          recordBotReplyUsage(tx, initial.scope, acknowledgedAt),
        );
        await notifyInbox(notifier, initial.tenantId, { conversationId });
        followUp = true;
        return "sent" as const;
      } finally {
        await repository.release(conversationId, token);
        if (followUp) await enqueue(initial.scope, conversationId);
        // Job retries also recover a warning after an interrupted acknowledgment,
        // even when the Conversation has no unanswered messages or is with the team.
        await allowance.notifyWarning?.({ scope: initial.scope, conversationId });
      }
    },
    async cleanup() {
      const now = clock.now();
      for (const conversationId of await listBotRecoveryCandidates(db, now)) {
        const scope = await resolveBotConversation(db, conversationId);
        if (!scope) continue;
        const repository = createConversationBotRepository(db, scope);
        if (await repository.failPending(conversationId, now, true)) {
          const found = await repository.load(conversationId);
          if (found) await notifyInbox(notifier, found.tenantId, { conversationId });
        }
        await enqueue(scope, conversationId);
        // Keep the expired lease recoverable if enqueue fails. A worker that
        // already claimed it has a later expiry and cannot be cleared here.
        await repository.clearExpired(conversationId, now);
      }
    },
  };
};

export type LiveBot = ReturnType<typeof createLiveBot>;
