import type { Database, Transaction } from "@/db/database";
import { contactCapReached } from "@/modules/bot/contact-cap";
import type { BotTurn } from "@/modules/bot/repository";
import { scheduleAllows } from "@/modules/bot/schedule";
import { readBotSettings } from "@/modules/bot/settings";
import type { ChannelRoute } from "@/modules/channels";
import { readBotEligibility, type ConversationHandoffReason } from "@/modules/conversations";
import type { Clock } from "@/platform/clock";

// Billing supplies this hook; live turns never infer allowance from sandbox usage.
export interface BotAllowance {
  canReply(turn: BotTurn): Promise<boolean>;
  reserve(tx: Transaction, turn: BotTurn): Promise<void>;
  notifyWarning(turn: BotTurn): Promise<void>;
}

// Where a live turn asks. `enqueue` only decides whether a turn is worth
// running; `beforeModel` and `beforeSend` decide whether it may reply.
export type ReplyCheckpoint = "enqueue" | "beforeModel" | "beforeSend";

export type ReplyDecision =
  | { kind: "reply" }
  | { kind: "skip" }
  | {
      kind: "handoff";
      reason: Extract<
        ConversationHandoffReason,
        "allowance_exhausted" | "contact_cap_reached" | "bot_unavailable"
      >;
    };

const reply: ReplyDecision = { kind: "reply" };
const skip: ReplyDecision = { kind: "skip" };

// Whether the Bot may send its next reply in a live Conversation now. Every
// checkpoint applies the same order and the first match wins:
//  1. not eligible (not activated, paused, unsubscribed, unhealthy, with the
//     team): skip
//  2. the service window has closed: skip
//  3. the reply allowance is used up: Handoff, even outside the Schedule
//  4. the Contact has had today's Bot replies: Handoff, even outside the Schedule
//  5. outside the Schedule: skip, never a Handoff
//  6. the Model or sender is unavailable: Handoff
// It reads the current saved state on every call, so a change during the
// Model call reaches the `beforeSend` check. It writes nothing.
export const createReplyGate = ({
  db,
  clock,
  allowance,
}: {
  db: Database;
  clock: Clock;
  allowance: BotAllowance;
}) => ({
  // `available`: whether the Model (beforeModel) or the sender (beforeSend) is.
  async check(
    turn: { scope: ChannelRoute; conversationId: string },
    checkpoint: ReplyCheckpoint,
    available = true,
  ): Promise<ReplyDecision> {
    const now = clock.now();
    const found = await readBotEligibility(db, turn.scope, turn.conversationId, now);
    if (!found?.eligible) return skip;
    // An exhausted allowance still runs a turn, so it can hand off.
    if (checkpoint === "enqueue") return reply;
    if (!found.windowOpen) return skip;
    if (!(await allowance.canReply(turn)))
      return { kind: "handoff", reason: "allowance_exhausted" };
    if (await contactCapReached(db, turn, now))
      return { kind: "handoff", reason: "contact_cap_reached" };
    if (!scheduleAllows(await readBotSettings(db, turn.scope), now)) return skip;
    if (!available) return { kind: "handoff", reason: "bot_unavailable" };
    return reply;
  },
});

export type ReplyGate = ReturnType<typeof createReplyGate>;
