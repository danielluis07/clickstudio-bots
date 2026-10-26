import type { Database } from "@/db/database";
import { readBotConfiguration } from "@/modules/bot/configuration";
import { recordBotReplyUsage } from "@/modules/bot/allowance";
import { liveTurnContext } from "@/modules/bot/context";
import { createBotCore } from "@/modules/bot/turn";
import { createReplyGate, type BotAllowance, type ReplyDecision } from "@/modules/bot/reply-gate";
import type { Model } from "@/modules/bot/model";
import type { UsageMeter } from "@/modules/bot/usage";
import type { ChannelRoute } from "@/modules/channels";
import {
  hasUnansweredContactMessages,
  readConversationContactDetails,
  recoverStaleBotTurns,
  runBotTurn,
  saveCapturedContactDetails,
  type LiveBotTurn,
  type WhatsAppSender,
} from "@/modules/conversations";
import type { Clock } from "@/platform/clock";
import type { Notifier } from "@/platform/notifier";

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
    if (await hasUnansweredContactMessages(db, scope, conversationId))
      await queue.enqueue([{ type: "run-bot-turn", conversationId }]);
  };

  const respond = async (turn: LiveBotTurn) => {
    const { scope, conversationId } = turn;
    // Every Handoff the gate decides is fenced by this turn's lease.
    const settle = async (decision: Exclude<ReplyDecision, { kind: "reply" }>) => {
      if (decision.kind === "skip") return "skipped" as const;
      await turn.handOff(decision.reason);
      return "handoff" as const;
    };
    const context = liveTurnContext(turn.snapshot, clock.now());
    if (!context) {
      await turn.consume();
      return "skipped" as const;
    }
    const beforeModel = await gate.check(turn, "beforeModel", model !== null);
    if (beforeModel.kind !== "reply") return settle(beforeModel);
    if (!model) return "skipped" as const;
    const core = createBotCore({
      model,
      clock,
      meter,
      repository: {
        getConfiguration: () => readBotConfiguration(db, scope),
        getContactDetails: () => readConversationContactDetails(db, scope, conversationId),
        // Stored as soon as captured: the Contact stated them whether or
        // not this turn's reply is sent.
        saveContactDetails: (_turn, details) =>
          saveCapturedContactDetails({ db, route: scope, notifier, conversationId, details }),
        listRecentMessages: async () => context,
      },
    });
    const outcome = await core.respond(turn);
    if (outcome.kind === "nothing_to_answer") {
      await turn.consume();
      return "skipped" as const;
    }
    const sender = await Promise.resolve()
      .then(getSender)
      .catch(() => null);
    // Everything may have changed during the Model call.
    const beforeSend = await gate.check(turn, "beforeSend", sender !== null);
    if (beforeSend.kind !== "reply") return settle(beforeSend);
    if (!sender) return "skipped" as const;
    const messageId = await turn.reserve(outcome.reply, {
      handoffReason: outcome.kind === "handoff" ? outcome.reason : undefined,
      beforeReserve: (tx) => allowance.reserve(tx, turn),
    });
    if (!messageId) return "skipped" as const;
    // A pending row is the durable send barrier. Never retry a send without a wamid.
    const sent = await sender
      .sendText({ ...turn.recipient, text: outcome.reply })
      .catch(() => null);
    if (!sent) {
      await turn.fail();
      return "handoff" as const;
    }
    const acknowledgedAt = clock.now();
    await turn.acknowledge(messageId, sent.wamid, (tx) =>
      recordBotReplyUsage(tx, scope, acknowledgedAt),
    );
    return "sent" as const;
  };

  return {
    enqueue,
    run: (conversationId: string) =>
      runBotTurn({ db, clock, notifier }, conversationId, respond, async (scope, followUp) => {
        if (followUp) await enqueue(scope, conversationId);
        // Job retries also recover a warning after an interrupted acknowledgment,
        // even when the Conversation has no unanswered messages or is with the team.
        await allowance.notifyWarning({ scope, conversationId });
      }),
    cleanup: () => recoverStaleBotTurns({ db, clock, notifier }, enqueue),
  };
};

export type LiveBot = ReturnType<typeof createLiveBot>;
