import type { Database } from "@/db/database";
import { createBotSweep } from "@/modules/bot/live-sweep";
import { createSendWithRetry, wait } from "@/modules/bot/live-send";
import type { BotJobQueue } from "@/modules/bot/live-jobs";
import { readBotConfiguration } from "@/modules/bot/configuration";
import { recordBotReplyUsage } from "@/modules/bot/allowance";
import { reserveContactReply } from "@/modules/bot/contact-cap";
import { ReservationRaceError } from "@/modules/bot/reservation-race";
import { liveTurnContext } from "@/modules/bot/context";
import { createBotCore, RetryableTurnError, type TurnTokens } from "@/modules/bot/turn";
import { createReplyGate, type BotAllowance, type ReplyDecision } from "@/modules/bot/reply-gate";
import type { Model } from "@/modules/bot/model";
import { recordBotTurn, type BotTurnRecord } from "@/modules/bot/turn-records";
import { type ChannelRoute } from "@/modules/channels";
import {
  hasUnansweredContactMessages,
  readConversationContactDetails,
  runBotTurn,
  saveCapturedContactDetails,
  type LiveBotTurn,
  type WhatsAppSender,
} from "@/modules/conversations";
import type { Clock } from "@/platform/clock";
import { annotateError, logError } from "@/platform/diagnostics";
import type { Notifier } from "@/platform/notifier";
import { RetryableError } from "@/platform/retryable";

export type { BotJob, BotJobQueue } from "@/modules/bot/live-jobs";

// People often send several short messages in a row. Each Contact message
// enqueues its Bot job `delaySeconds` later, and a job whose newest unanswered
// message is younger than `quietMs` waits for that message's own job, so a
// burst gets one reply (#144). `quietMs` stays below the delay: Meta's
// timestamps are truncated to the second, and a job must never wait on
// itself. A Contact who keeps writing is answered once their oldest unanswered
// message is `maxWaitMs` old. A single message waits only the delay.
export type BurstWait = { delaySeconds: number; quietMs: number; maxWaitMs: number };
export const burstWait: BurstWait = { delaySeconds: 3, quietMs: 2_000, maxWaitMs: 15_000 };

// Whether a later Contact message's own job will answer this burst.
const stillWriting = (
  messages: readonly { sentAt: Date }[],
  now: Date,
  { quietMs, maxWaitMs }: BurstWait,
) => {
  if (!messages.length) return false;
  const sent = messages.map(({ sentAt }) => sentAt.getTime());
  const age = (at: number) => now.getTime() - at;
  return age(Math.max(...sent)) < quietMs && age(Math.min(...sent)) < maxWaitMs;
};

// Deliveries of one Bot job that may meet a transient Model failure. Each
// earlier one fails the job, so the queue delivers it again, 2 s and then
// 30 s later; the last hands off. A Contact waits about a minute at most,
// counting each attempt's Model timeout. The queue must allow at least this
// many deliveries.
export const botTurnAttempts = 3;

// Milliseconds a turn waited on the Model; unset until its first call.
type ModelTiming = { modelMs?: number };

export const createLiveBot = ({
  db,
  clock,
  model,
  queue,
  notifier,
  getSender,
  allowance,
  sleep = wait,
  burst = burstWait,
}: {
  db: Database;
  clock: Clock;
  model: Model | null;
  queue: BotJobQueue;
  notifier: Notifier;
  getSender: () => WhatsAppSender;
  allowance: BotAllowance;
  sleep?: (ms: number) => Promise<void>;
  // Null answers every job at once.
  burst?: BurstWait | null;
}) => {
  const gate = createReplyGate({ db, clock, allowance });
  const enqueue = async (scope: ChannelRoute, conversationId: string) => {
    if ((await gate.check({ scope, conversationId }, "enqueue")).kind !== "reply") return;
    if (await hasUnansweredContactMessages(db, scope, conversationId))
      await queue.enqueue([
        {
          type: "run-bot-turn",
          conversationId,
          ...(burst ? { delaySeconds: burst.delaySeconds } : {}),
        },
      ]);
  };

  type Ended = {
    result: "sent" | "skipped" | "handoff";
    handoffReason?: BotTurnRecord["handoffReason"];
    tokens?: TurnTokens;
  };

  const send = createSendWithRetry({ db, clock, sleep });

  // Adds each Model call's wait to the turn's `timing`, including a call that
  // times out, so a turn record shows how much of its duration was the Model.
  const timed = (model: Model, timing: ModelTiming): Model => ({
    async generate(request) {
      const startedAt = clock.now().getTime();
      try {
        return await model.generate(request);
      } finally {
        timing.modelMs = (timing.modelMs ?? 0) + clock.now().getTime() - startedAt;
      }
    },
  });

  // Shows the Contact "digitando…" on their latest message while the Model
  // works (#229). Never awaited: a slow or failed indicator must not delay or
  // fail the turn. The adapter logs a Meta failure; an unavailable sender
  // hands off later, at the send.
  const indicateTyping = (turn: LiveBotTurn) => {
    const wamid = turn.snapshot.current.at(-1)?.wamid;
    if (!wamid) return;
    void Promise.resolve()
      .then(() => getSender().indicateTyping({ ...turn.recipient, wamid }))
      .catch(() => {});
  };

  const decide = async (
    turn: LiveBotTurn,
    retryTransient: boolean,
    timing: ModelTiming,
  ): Promise<Ended> => {
    const { scope, conversationId } = turn;
    // Leaves the Contact's messages unanswered on purpose, for now.
    const skip = async (tokens?: TurnTokens): Promise<Ended> => {
      await turn.skip();
      return { result: "skipped", tokens };
    };
    // Every Handoff the gate decides is fenced by this turn's lease.
    const settle = async (
      decision: Exclude<ReplyDecision, { kind: "reply" }>,
      tokens?: TurnTokens,
    ): Promise<Ended> => {
      if (decision.kind === "skip") return skip(tokens);
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
    if (!model) return skip();
    indicateTyping(turn);
    const core = createBotCore({
      model: timed(model, timing),
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
    const outcome = await core.respond(turn, { retryTransient });
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
    if (!sender) return skip(tokens);
    const handoffReason = outcome.kind === "handoff" ? outcome.reason : undefined;
    const messageId = await turn.reserve(outcome.reply, {
      handoffReason,
      beforeReserve: async (tx) => {
        await allowance.reserve(tx, turn);
        await reserveContactReply(tx, turn, clock.now());
      },
    });
    if (!messageId) return skip(tokens);
    // The Contact already has the unavailability notice: handed off, unsent.
    if (typeof messageId !== "string")
      return { result: "handoff", handoffReason: "bot_unavailable", tokens };
    // A pending row is the durable send barrier. Never retry a send that may
    // have reached Meta; a later turn fails a pending reply without a wamid.
    const sent = await send(scope, sender, { ...turn.recipient, text: outcome.reply });
    if (!sent) {
      await turn.fail();
      // A Model-requested Handoff, already stored, keeps its reason.
      return { result: "handoff", handoffReason: handoffReason ?? "bot_unavailable", tokens };
    }
    const acknowledgedAt = clock.now();
    await turn.acknowledge(messageId, sent.wamid, (tx) =>
      recordBotReplyUsage(tx, scope, acknowledgedAt),
    );
    return { result: "sent", handoffReason, tokens };
  };

  // Records how every completed turn ended (#137), and each attempt its job
  // retries after a transient Model failure, with the tokens it used. Any
  // other turn that throws is retried by its job and recorded when it
  // completes.
  const respond = async (turn: LiveBotTurn, retryTransient: boolean) => {
    const startedAt = clock.now();
    const timing: ModelTiming = {};
    const record = async (
      outcome: BotTurnRecord["outcome"],
      { handoffReason, tokens }: Pick<Ended, "handoffReason" | "tokens">,
    ) => {
      const at = clock.now();
      await recordBotTurn(db, turn.scope, {
        at,
        outcome,
        handoffReason,
        tokens,
        durationMs: at.getTime() - startedAt.getTime(),
        modelDurationMs: timing.modelMs,
      }).catch((error: unknown) =>
        // A lost record must not fail a turn whose reply was already sent.
        logError("bot_turn_record_failed", error, {
          tenantId: turn.scope.tenantId,
          conversationId: turn.conversationId,
        }),
      );
    };
    const ended = await decide(turn, retryTransient, timing).catch(async (error: unknown) => {
      if (error instanceof RetryableTurnError) await record("retried", { tokens: error.tokens });
      throw error;
    });
    // A Model-requested Handoff may also send a reply; it still counts as a Handoff.
    await record(ended.handoffReason ? "handoff" : ended.result, ended);
    return ended.result;
  };

  return {
    enqueue,
    // `attempt` counts this job's deliveries from 1. Without one, the turn is
    // the last: a transient Model failure hands off. "retry" asks the queue to
    // deliver the job again; the turn released its lease and reserved nothing.
    async run(conversationId: string, { attempt = botTurnAttempts }: { attempt?: number } = {}) {
      // The job knows only the Conversation; a failure also names its Tenant.
      let tenantId: string | undefined;
      try {
        return await runBotTurn(
          { db, clock, notifier },
          conversationId,
          async (turn) => {
            tenantId = turn.scope.tenantId;
            // Nothing is answered or recorded: the newer message's job answers
            // the whole burst, and the sweep recovers it if that job is lost.
            if (burst && stillWriting(turn.snapshot.current, clock.now(), burst))
              return "waiting" as const;
            return respond(turn, attempt < botTurnAttempts);
          },
          async (scope, followUp) => {
            tenantId = scope.tenantId;
            if (followUp) await enqueue(scope, conversationId);
            // Best effort, even when the Conversation has no unanswered messages
            // or is with the team: a failed email must not fail a turn whose
            // reply was sent. The daily `retryWarnings` task recovers it (#142).
            await allowance.notifyWarning({ scope, conversationId }).catch((error: unknown) =>
              logError("email_send_failed", error, {
                tenantId: scope.tenantId,
                conversationId,
                operation: "bot-reply-warning",
              }),
            );
          },
        );
      } catch (error) {
        // Expected: a Model failure already recorded as such, or a concurrent
        // turn that took the last reply slot. Neither reserved anything.
        if (error instanceof RetryableError || error instanceof ReservationRaceError)
          return "retry" as const;
        throw annotateError(error, { tenantId, conversationId });
      }
    },
    sweep: createBotSweep({ db, clock, notifier, queue, gate, enqueue }),
  };
};

export type LiveBot = ReturnType<typeof createLiveBot>;
