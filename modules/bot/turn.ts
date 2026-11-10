import { detailsRequest, isDetailsRequest, missingRequired } from "@/modules/bot/capture";
import { configuredLinkReply } from "@/modules/bot/links";
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
  ModelUsage,
} from "@/modules/bot/model";
import {
  renderContactDetails,
  renderInstructions,
  renderKnowledgeBase,
} from "@/modules/bot/prompt";
import type { BotRepository, BotTurn } from "@/modules/bot/repository";
import { checkToolCalls, handoffReply, modelTools, type HandoffReason } from "@/modules/bot/tools";
import type { Clock } from "@/platform/clock";
import { logError } from "@/platform/diagnostics";

// Counts, never content: what a Bot turn's Model requests cost.
export type TurnTokens = ModelUsage & {
  // Requests that returned tool results to the model.
  toolRoundTrips: number;
};

// A Handoff's reply tells the Contact the team will answer; with a mixed
// question it also carries the answerable part. Every outcome that called the
// Model carries its tokens, including a Handoff after a provider error.
export type TurnOutcome =
  | { kind: "answer"; reply: string; tokens: TurnTokens }
  | { kind: "handoff"; reason: HandoffReason; reply: string; tokens: TurnTokens }
  | { kind: "nothing_to_answer" };

type Decision =
  { kind: "answer"; reply: string } | { kind: "handoff"; reason: HandoffReason; reply: string };

export type TurnDecision = Decision | { kind: "nothing_to_answer" };

const noTokens: TurnTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  toolRoundTrips: 0,
};

// Separates what a turn decided from what it cost, for callers that show or
// store the decision without production cost data.
export const splitTokens = (
  outcome: TurnOutcome,
): { decision: TurnDecision; tokens: TurnTokens } => {
  if (outcome.kind === "nothing_to_answer") return { decision: outcome, tokens: { ...noTokens } };
  if (outcome.kind === "answer")
    return { decision: { kind: outcome.kind, reply: outcome.reply }, tokens: outcome.tokens };
  const { kind, reason, reply, tokens } = outcome;
  return { decision: { kind, reason, reply }, tokens };
};

const tokenKeys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const;

const handoff = (reason: HandoffReason, answered = ""): Decision => ({
  kind: "handoff",
  reason,
  reply: handoffReply(reason, answered),
});

// Decides one Bot reply for a Conversation: a grounded answer or a Handoff.
// It sends nothing; the caller delivers the reply.
export const createBotCore = ({
  model,
  repository,
  clock,
  context = defaultContextLimits,
}: {
  model: Model;
  repository: BotRepository;
  clock: Clock;
  context?: ContextLimits;
}) => ({
  // It never checks whether a reply may be sent now; live turns ask the reply
  // gate.
  async respond(turn: BotTurn): Promise<TurnOutcome> {
    const window = contextWindow(clock.now(), context);
    const [{ behaviour, knowledgeBase, capture, links }, details, recent] = await Promise.all([
      repository.getConfiguration(turn),
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
      tools: modelTools(capture, links),
      instructions: renderInstructions(behaviour, capture, links),
      knowledgeBase: renderKnowledgeBase(knowledgeBase),
      contact: renderContactDetails(capture, details),
      messages,
    };
    const usage: TurnTokens = { ...noTokens };
    const generate = async (messages: ModelMessage[]) => {
      const response = await model.generate({ ...request, messages });
      for (const key of tokenKeys) usage[key] += response.usage[key];
      return response;
    };

    const decide = async (): Promise<Decision> => {
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
        const checked = checkToolCalls(response.toolCalls, capture, links);
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
        const reply = checked.links.length
          ? configuredLinkReply(checked.links)
          : response.text.trim();
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

    const ids = { tenantId: turn.scope.tenantId, conversationId: turn.conversationId };
    // A timeout or provider error never falls back to another provider. It is
    // expected, so it is logged with the provider's status but does not alert.
    const decision = await decide().catch((error: unknown) => {
      logError("bot_decision_failed", error, ids);
      return handoff("bot_indisponivel");
    });
    return { ...decision, tokens: usage };
  },
});

export type BotCore = ReturnType<typeof createBotCore>;
