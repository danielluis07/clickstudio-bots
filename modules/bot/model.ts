// The Bot reaches its language model only through this port, so the
// evaluation harness and "Testar Bot" run the same contract as production.

export type ModelTool = {
  name: string;
  description: string;
  // JSON Schema of the input. The model may still send anything; the core
  // validates every call itself.
  inputSchema: Record<string, unknown>;
};

export type ModelToolCall = {
  id: string;
  name: string;
  // As the model sent it: possibly malformed, or even unparsed text.
  input: unknown;
};

// Why the core refused a tool call, returned so the model can retry.
export type ModelToolRefusal = { callId: string; name: string; error: string };

export type ModelMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ModelToolCall[] }
  // Refusals of the previous message's tool calls.
  | { role: "tool"; results: ModelToolRefusal[] };

export type ModelRequest = {
  // A stable prefix the provider caches, in this order: tools, instructions
  // (system and behaviour settings), then the whole Knowledge base.
  tools: ModelTool[];
  instructions: string;
  knowledgeBase: string;
  messages: ModelMessage[];
};

export type ModelUsage = {
  // Input tokens neither read from nor written to the cache.
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type ModelResponse = {
  text: string;
  toolCalls: ModelToolCall[];
  usage: ModelUsage;
};

// Rejects on any provider error or timeout. There is no fallback provider.
export interface Model {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
