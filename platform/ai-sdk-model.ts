import { createAnthropic } from "@ai-sdk/anthropic";
import {
  generateText,
  jsonSchema,
  tool,
  type LanguageModel,
  type ModelMessage as SdkMessage,
} from "ai";

// Implements the Bot's Model port (`@/modules/bot`) with the Vercel AI SDK.
// The shapes below mirror that port, which platform code cannot import.

type ToolCall = { id: string; name: string; input: unknown };

type Request = {
  tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
  instructions: string;
  knowledgeBase: string;
  messages: (
    | { role: "user"; text: string }
    | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
    | { role: "tool"; results: { callId: string; name: string; error: string }[] }
  )[];
};

// Provisional until the provider evaluation locks the model.
export const defaultBotModelId = "claude-haiku-5-5";

export const createAnthropicLanguageModel = ({
  apiKey,
  modelId = defaultBotModelId,
}: {
  apiKey: string;
  modelId?: string;
}) => createAnthropic({ apiKey })(modelId);

// Replayed tool calls must carry an object input, even one the model sent
// malformed; the refusal that follows explains the problem.
const replayedInput = (input: unknown) =>
  typeof input === "object" && input !== null && !Array.isArray(input) ? input : {};

const toSdkMessage = (message: Request["messages"][number]): SdkMessage => {
  switch (message.role) {
    case "user":
      return { role: "user", content: [{ type: "text", text: message.text }] };
    case "assistant":
      return {
        role: "assistant",
        content: [
          ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
          ...(message.toolCalls ?? []).map((call) => ({
            type: "tool-call" as const,
            toolCallId: call.id,
            toolName: call.name,
            input: replayedInput(call.input),
          })),
        ],
      };
    case "tool":
      return {
        role: "tool",
        content: message.results.map((result) => ({
          type: "tool-result" as const,
          toolCallId: result.callId,
          toolName: result.name,
          output: { type: "error-text" as const, value: result.error },
        })),
      };
  }
};

export const createAiSdkModel = ({
  model,
  timeoutMs = 10_000,
  maxOutputTokens = 1_024,
}: {
  model: LanguageModel;
  timeoutMs?: number;
  maxOutputTokens?: number;
}) => ({
  async generate(request: Request) {
    const result = await generateText({
      model,
      // Tools have no `execute`: the core validates and acts on every call.
      tools: Object.fromEntries(
        request.tools.map(({ name, description, inputSchema }) => [
          name,
          tool({ description, inputSchema: jsonSchema(inputSchema) }),
        ]),
      ),
      // The breakpoint after the Knowledge base caches tools, instructions and
      // Knowledge base together, for the default five minutes.
      instructions: [
        { role: "system", content: request.instructions },
        {
          role: "system",
          content: request.knowledgeBase,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        },
      ],
      messages: request.messages.map(toSdkMessage),
      maxOutputTokens,
      // A failure hands off at once rather than retry past the reply budget.
      maxRetries: 0,
      timeout: timeoutMs,
    });
    const { inputTokenDetails } = result.usage;
    const cacheReadTokens = inputTokenDetails.cacheReadTokens ?? 0;
    const cacheWriteTokens = inputTokenDetails.cacheWriteTokens ?? 0;
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((call): ToolCall => ({
        id: call.toolCallId,
        name: call.toolName,
        input: call.input,
      })),
      usage: {
        inputTokens:
          inputTokenDetails.noCacheTokens ??
          Math.max(0, (result.usage.inputTokens ?? 0) - cacheReadTokens - cacheWriteTokens),
        outputTokens: result.usage.outputTokens ?? 0,
        cacheReadTokens,
        cacheWriteTokens,
      },
    };
  },
});
