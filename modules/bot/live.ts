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
  listStrandedBotConversations,
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

// The sweep recovers a Contact message whose Bot job never ran once it is two
// minutes old, past any live turn's lease. After an hour it leaves it: a
// message that old was skipped on purpose, outside the Schedule, and waits for
// the Contact to write again.
const strandedAfterMs = 2 * 60_000;
const strandedUntilMs = 60 * 60_000;
const strandedPerSweep = 100;
// Pages a sweep may scan when the reply gate skips whole Tenants.
const strandedPages = 3;

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
    // Every few minutes: recovers crashed turns, then re-enqueues Contact
    // messages whose job never ran. Idempotent; each scan is bounded.
    async sweep() {
      const recovered = new Set<string>();
      await recoverStaleBotTurns({ db, clock, notifier }, async (scope, conversationId) => {
        recovered.add(conversationId);
        await enqueue(scope, conversationId);
      });
      const now = clock.now();
      const skippedTenants = new Set<string>();
      const seen = new Set(recovered);
      const jobs: BotJob[] = [];
      for (let page = 0; page < strandedPages && jobs.length < strandedPerSweep; page++) {
        const stranded = await listStrandedBotConversations(db, now, {
          sentAfter: new Date(now.getTime() - strandedUntilMs),
          sentBy: new Date(now.getTime() - strandedAfterMs),
          limit: strandedPerSweep - jobs.length,
          except: { tenantIds: [...skippedTenants], conversationIds: [...seen] },
        });
        if (!stranded.length) break;
        for (const candidate of stranded) {
          seen.add(candidate.conversationId);
          if (skippedTenants.has(candidate.scope.tenantId)) continue;
          // The gate as the turn would see it, so a Schedule skip is not
          // retried every sweep. Eligibility and the service window are in
          // the scan; the Schedule and allowance are per Tenant, so one skip
          // leaves the Tenant's other Conversations for the next page.
          // An exhausted allowance still runs, to hand off.
          if ((await gate.check(candidate, "beforeModel")).kind === "skip")
            skippedTenants.add(candidate.scope.tenantId);
          else jobs.push({ type: "run-bot-turn", conversationId: candidate.conversationId });
        }
      }
      if (jobs.length) await queue.enqueue(jobs);
    },
  };
};

export type LiveBot = ReturnType<typeof createLiveBot>;
