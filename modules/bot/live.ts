import type { Database } from "@/db/database";
import { readBotConfiguration } from "@/modules/bot/configuration";
import { recordBotReplyUsage } from "@/modules/bot/allowance";
import { liveTurnContext } from "@/modules/bot/context";
import { createBotCore, type TurnTokens } from "@/modules/bot/turn";
import { createReplyGate, type BotAllowance, type ReplyDecision } from "@/modules/bot/reply-gate";
import type { Model } from "@/modules/bot/model";
import { recordBotTurn, type BotTurnRecord } from "@/modules/bot/turn-records";
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
import { annotateError, logError } from "@/platform/diagnostics";
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
  allowance,
}: {
  db: Database;
  clock: Clock;
  model: Model | null;
  queue: BotJobQueue;
  notifier: Notifier;
  getSender: () => WhatsAppSender;
  allowance: BotAllowance;
}) => {
  const gate = createReplyGate({ db, clock, allowance });
  const enqueue = async (scope: ChannelRoute, conversationId: string) => {
    if ((await gate.check({ scope, conversationId }, "enqueue")).kind !== "reply") return;
    if (await hasUnansweredContactMessages(db, scope, conversationId))
      await queue.enqueue([{ type: "run-bot-turn", conversationId }]);
  };

  type Ended = {
    result: "sent" | "skipped" | "handoff";
    handoffReason?: BotTurnRecord["handoffReason"];
    tokens?: TurnTokens;
  };

  const decide = async (turn: LiveBotTurn): Promise<Ended> => {
    const { scope, conversationId } = turn;
    // Every Handoff the gate decides is fenced by this turn's lease.
    const settle = async (
      decision: Exclude<ReplyDecision, { kind: "reply" }>,
      tokens?: TurnTokens,
    ): Promise<Ended> => {
      if (decision.kind === "skip") return { result: "skipped", tokens };
      await turn.handOff(decision.reason);
      return { result: "handoff", handoffReason: decision.reason, tokens };
    };
    const context = liveTurnContext(turn.snapshot, clock.now());
    if (!context) {
      await turn.consume();
      return { result: "skipped" };
    }
    const beforeModel = await gate.check(turn, "beforeModel", model !== null);
    if (beforeModel.kind !== "reply") return settle(beforeModel);
    if (!model) return { result: "skipped" };
    const core = createBotCore({
      model,
      clock,
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
      return { result: "skipped" };
    }
    const { tokens } = outcome;
    const sender = await Promise.resolve()
      .then(getSender)
      .catch(() => null);
    // Everything may have changed during the Model call.
    const beforeSend = await gate.check(turn, "beforeSend", sender !== null);
    if (beforeSend.kind !== "reply") return settle(beforeSend, tokens);
    if (!sender) return { result: "skipped", tokens };
    const handoffReason = outcome.kind === "handoff" ? outcome.reason : undefined;
    const messageId = await turn.reserve(outcome.reply, {
      handoffReason,
      beforeReserve: (tx) => allowance.reserve(tx, turn),
    });
    if (!messageId) return { result: "skipped", tokens };
    // A pending row is the durable send barrier. Never retry a send without a wamid.
    const sent = await sender
      .sendText({ ...turn.recipient, text: outcome.reply })
      .catch(() => null);
    if (!sent) {
      await turn.fail();
      // A Model-requested Handoff, already stored, keeps its reason.
      return { result: "handoff", handoffReason: handoffReason ?? "bot_indisponivel", tokens };
    }
    const acknowledgedAt = clock.now();
    await turn.acknowledge(messageId, sent.wamid, (tx) =>
      recordBotReplyUsage(tx, scope, acknowledgedAt),
    );
    return { result: "sent", handoffReason, tokens };
  };

  // Records how every completed turn ended (#137). A turn that throws is
  // retried by its job and recorded when it completes.
  const respond = async (turn: LiveBotTurn) => {
    const startedAt = clock.now();
    const ended = await decide(turn);
    const at = clock.now();
    await recordBotTurn(db, turn.scope, {
      at,
      // A Model-requested Handoff may also send a reply; it still counts as a Handoff.
      outcome: ended.handoffReason ? "handoff" : ended.result,
      handoffReason: ended.handoffReason,
      tokens: ended.tokens,
      durationMs: at.getTime() - startedAt.getTime(),
    }).catch((error: unknown) =>
      // A lost record must not fail a turn whose reply was already sent.
      logError("bot_turn_record_failed", error, {
        tenantId: turn.scope.tenantId,
        conversationId: turn.conversationId,
      }),
    );
    return ended.result;
  };

  return {
    enqueue,
    async run(conversationId: string) {
      // The job knows only the Conversation; a failure also names its Tenant.
      let tenantId: string | undefined;
      try {
        return await runBotTurn(
          { db, clock, notifier },
          conversationId,
          (turn) => {
            tenantId = turn.scope.tenantId;
            return respond(turn);
          },
          async (scope, followUp) => {
            tenantId = scope.tenantId;
            if (followUp) await enqueue(scope, conversationId);
            // Job retries also recover a warning after an interrupted acknowledgment,
            // even when the Conversation has no unanswered messages or is with the team.
            await allowance.notifyWarning({ scope, conversationId });
          },
        );
      } catch (error) {
        throw annotateError(error, { tenantId, conversationId });
      }
    },
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
