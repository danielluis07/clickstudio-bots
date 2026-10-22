import { detailsRequest, isDetailsRequest, missingRequired } from "@/modules/bot/capture";
import {
  contextWindow,
  defaultContextLimits,
  memberLabel,
  replayContext,
  type ContextLimits,
} from "@/modules/bot/context";
import type {
  Model,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelToolOutput,
  ModelToolRefusal,
} from "@/modules/bot/model";
import {
  renderContactDetails,
  renderInstructions,
  renderKnowledgeBase,
} from "@/modules/bot/prompt";
import type { BotRepository, BotTurn } from "@/modules/bot/repository";
import { scheduleAllows } from "@/modules/bot/schedule";
import { checkToolCalls, handoffReply, modelTools, type HandoffReason } from "@/modules/bot/tools";
import type { TurnUsage, UsageMeter } from "@/modules/bot/usage";
import type { Clock } from "@/platform/clock";

// A Handoff's reply tells the Contact the team will answer; with a mixed
// question it also carries the answerable part.
export type TurnOutcome =
  | { kind: "answer"; reply: string }
  | { kind: "handoff"; reason: HandoffReason; reply: string }
  | { kind: "nothing_to_answer" };

const tokenKeys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const;

const handoff = (reason: HandoffReason, answered = ""): TurnOutcome => ({
  kind: "handoff",
  reason,
  reply: handoffReply(reason, answered),
});

// Decides one Bot reply for a Conversation: a grounded answer or a Handoff.
// It sends nothing; the caller delivers the reply.
export const createBotCore = ({
  model,
  repository,
  meter,
  clock,
  context = defaultContextLimits,
}: {
  model: Model;
  repository: BotRepository;
  meter: UsageMeter;
  clock: Clock;
  context?: ContextLimits;
}) => ({
  // Whether the Tenant's schedule lets the Bot reply now. A reply also needs
  // the Conversation with the Bot and the Channel unpaused; this checks only
  // the schedule, and a false never hands the Conversation off.
  async isScheduled(turn: BotTurn) {
    return scheduleAllows(await repository.getBehaviour(turn), clock.now());
  },

  async respond(turn: BotTurn): Promise<TurnOutcome> {
    const window = contextWindow(clock.now(), context);
    const [behaviour, knowledgeBase, capture, details, recent] = await Promise.all([
      repository.getBehaviour(turn),
      repository.getKnowledgeBase(turn),
      repository.getCapture(turn),
      repository.getContactDetails(turn),
      repository.listRecentMessages(turn, window),
    ]);
    const messages = replayContext(recent, window);
    if (!messages) return { kind: "nothing_to_answer" };
    // Required details are asked for once: if the Bot's latest reply asked,
    // the Contact has answered it, and a Handoff now goes ahead regardless.
    const latestBotReply = messages.findLast(
      (message) => message.role === "assistant" && !message.text.startsWith(memberLabel),
    );
    const askedForDetails =
      latestBotReply?.role === "assistant" && isDetailsRequest(latestBotReply.text);
    const request: ModelRequest = {
      tools: modelTools(capture),
      instructions: renderInstructions(behaviour, capture),
      knowledgeBase: renderKnowledgeBase(knowledgeBase),
      contact: renderContactDetails(capture, details),
      messages,
    };
    const usage: TurnUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      toolRoundTrips: 0,
    };
    const generate = async (messages: ModelMessage[]) => {
      const response = await model.generate({ ...request, messages });
      for (const key of tokenKeys) usage[key] += response.usage[key];
      return response;
    };

    const decide = async (): Promise<TurnOutcome> => {
      let messages = request.messages;
      let retried = false;
      let continued = false;
      // The Contact's details as saved, with what this turn captured.
      const known = { ...details };
      // The model sees its own calls and their results before it continues.
      const roundTrip = (
        response: ModelResponse,
        results: (ModelToolRefusal | ModelToolOutput)[],
      ) => {
        usage.toolRoundTrips += 1;
        messages = [
          ...messages,
          { role: "assistant", text: response.text, toolCalls: response.toolCalls },
          { role: "tool", results },
        ];
      };
      for (;;) {
        const response = await generate(messages);
        const checked = checkToolCalls(response.toolCalls, capture);
        if (!checked.valid) {
          // A refused response's text is never sent, even beside a valid answer.
          if (retried) return handoff("bot_indisponivel");
          // One retry: the model sees why its calls were refused.
          retried = true;
          roundTrip(response, checked.errors);
          continue;
        }
        if (checked.captured) {
          await repository.saveContactDetails(turn, checked.captured);
          Object.assign(known, checked.captured);
        }
        const reply = response.text.trim();
        if (checked.handoff) {
          const missing = missingRequired(capture, known);
          if (missing.length && !askedForDetails)
            return { kind: "answer", reply: detailsRequest(missing, reply) };
          return handoff(checked.handoff.reason, reply);
        }
        if (reply) return { kind: "answer", reply };
        // A capture alone gets one chance to write the reply it left out.
        if (!checked.captured || continued) return handoff("bot_indisponivel");
        continued = true;
        roundTrip(
          response,
          response.toolCalls.map((call) => ({
            callId: call.id,
            name: call.name,
            output: "Saved.",
          })),
        );
      }
    };

    // A timeout or provider error never falls back to another provider.
    const outcome = await decide().catch(() => handoff("bot_indisponivel"));
    // Metering must not lose a reply the model already produced.
    await meter
      .record(turn.scope, clock.now(), usage)
      .catch(() => console.error("Bot usage metering failed"));
    return outcome;
  },
});

export type BotCore = ReturnType<typeof createBotCore>;
