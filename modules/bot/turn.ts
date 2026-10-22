import {
  contextWindow,
  defaultContextLimits,
  replayContext,
  type ContextLimits,
} from "@/modules/bot/context";
import type { Model, ModelMessage, ModelRequest, ModelResponse } from "@/modules/bot/model";
import { renderInstructions, renderKnowledgeBase } from "@/modules/bot/prompt";
import type { BotRepository, BotTurn } from "@/modules/bot/repository";
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
  async respond(turn: BotTurn): Promise<TurnOutcome> {
    const window = contextWindow(clock.now(), context);
    const [behaviour, knowledgeBase, recent] = await Promise.all([
      repository.getBehaviour(turn),
      repository.getKnowledgeBase(turn),
      repository.listRecentMessages(turn, window),
    ]);
    const messages = replayContext(recent, window);
    if (!messages) return { kind: "nothing_to_answer" };
    const request: ModelRequest = {
      tools: modelTools,
      instructions: renderInstructions(behaviour),
      knowledgeBase: renderKnowledgeBase(knowledgeBase),
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
      let response: ModelResponse = await generate(request.messages);
      let checked = checkToolCalls(response.toolCalls);
      if (!checked.valid) {
        // One retry: the model sees why its calls were refused.
        usage.toolRoundTrips += 1;
        response = await generate([
          ...request.messages,
          { role: "assistant", text: response.text, toolCalls: response.toolCalls },
          { role: "tool", results: checked.errors },
        ]);
        checked = checkToolCalls(response.toolCalls);
      }
      // A refused response's text is never sent, even beside a valid answer.
      if (!checked.valid) return handoff("bot_indisponivel");
      const reply = response.text.trim();
      if (!reply && !checked.handoff) return handoff("bot_indisponivel");
      return checked.handoff ? handoff(checked.handoff.reason, reply) : { kind: "answer", reply };
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
