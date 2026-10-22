import type { Database } from "@/db/database";
import { createBotCore } from "@/modules/bot/turn";
import { readBehaviour } from "@/modules/bot/settings";
import { scheduleAllows } from "@/modules/bot/schedule";
import type { Model } from "@/modules/bot/model";
import type { BotTurn, ContextMessage } from "@/modules/bot/repository";
import type { UsageMeter } from "@/modules/bot/usage";
import type { ChannelRoute } from "@/modules/channels";
import {
  createConversationRepository,
  recordBotReplySent,
  createConversationBotRepository,
  resolveBotConversation,
  listBotRecoveryCandidates,
  type WhatsAppSender,
} from "@/modules/conversations";
import { readKnowledgeBase } from "@/modules/knowledge-base";
import type { Clock } from "@/platform/clock";
import { notifyInbox, type Notifier } from "@/platform/notifier";

export type BotJob = { type: "run-bot-turn"; conversationId: string };
export interface BotJobQueue {
  enqueue(jobs: readonly BotJob[]): Promise<void>;
}
// Billing supplies this hook; live turns never infer allowance from sandbox usage.
export interface BotAllowance {
  canReply(turn: BotTurn): Promise<boolean>;
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
  const eligible = (
    found: Awaited<ReturnType<ReturnType<typeof createConversationBotRepository>["load"]>>,
  ) =>
    found &&
    found.enabled &&
    !found.paused &&
    found.subscribed === "subscribed" &&
    found.owner === "bot";
  const enqueue = async (scope: ChannelRoute, conversationId: string) => {
    const repository = createConversationBotRepository(db, scope);
    const found = await repository.load(conversationId);
    if (
      !eligible(found) ||
      found!.scope.channelId !== scope.channelId ||
      found!.tenantId !== scope.tenantId
    )
      return;
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
      try {
        if (await repository.failPending(conversationId, clock.now())) {
          await notifyInbox(notifier, initial.tenantId, { conversationId });
          return "handoff" as const;
        }
        if (!eligible(await repository.load(conversationId))) return "skipped" as const;
        const snapshot = await db.transaction(
          (tx) => createConversationBotRepository(tx, initial.scope).snapshot(conversationId),
          { isolationLevel: "repeatable read", accessMode: "read only" },
        );
        const pending = snapshot.pending;
        if (!pending.length) return "skipped" as const;
        const ids = pending.map(({ id }) => id);
        const reader = createConversationRepository(db, initial.scope);
        const found = await reader.getConversation(conversationId);
        if (!found?.serviceWindowClosesAt || found.serviceWindowClosesAt <= clock.now())
          return "skipped" as const;
        const turn = { scope: initial.scope, conversationId };
        if (!scheduleAllows(await readBehaviour(db, initial.scope), clock.now()))
          return "skipped" as const;
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
        if (!eligible(await repository.load(conversationId))) return "skipped" as const;
        if (!model) {
          await repository.handoff(conversationId, token, "bot_indisponivel");
          await notifyInbox(notifier, initial.tenantId, { conversationId });
          return "handoff" as const;
        }
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
        if (!(await core.isScheduled(turn))) return "skipped" as const;
        const outcome = await core.respond(turn);
        if (outcome.kind === "nothing_to_answer") {
          await repository.consume(conversationId, token, ids, clock.now());
          followUp = true;
          return "skipped" as const;
        }
        if (!(await core.isScheduled(turn)) || !eligible(await repository.load(conversationId)))
          return "skipped" as const;
        const sender = await Promise.resolve()
          .then(getSender)
          .catch(() => null);
        if (!sender) {
          await repository.handoff(conversationId, token, "bot_indisponivel");
          await notifyInbox(notifier, initial.tenantId, { conversationId });
          return "handoff" as const;
        }
        // All mutable gates are checked again after the Model call.
        if (!(await core.isScheduled(turn))) return "skipped" as const;
        const allowed = await allowance.canReply(turn);
        if (!(await core.isScheduled(turn)) || !eligible(await repository.load(conversationId)))
          return "skipped" as const;
        if (!allowed) {
          await repository.handoff(conversationId, token, "limite_atingido");
          await notifyInbox(notifier, initial.tenantId, { conversationId });
          return "handoff" as const;
        }
        const messageId = await repository.reserve(
          conversationId,
          token,
          ids,
          outcome.reply,
          clock.now(),
          outcome.kind === "handoff" ? outcome.reason : undefined,
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
        await recordBotReplySent(db, initial.scope, messageId, sent.wamid);
        await notifyInbox(notifier, initial.tenantId, { conversationId });
        followUp = true;
        return "sent" as const;
      } finally {
        await repository.release(conversationId, token);
        if (followUp) await enqueue(initial.scope, conversationId);
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
