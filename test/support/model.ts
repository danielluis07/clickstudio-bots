import type { Model, ModelRequest, ModelResponse, ModelUsage } from "@/modules/bot";

type ScriptedResponse = Partial<Omit<ModelResponse, "usage">> & { usage?: Partial<ModelUsage> };
type Script = ScriptedResponse | Error | ((request: ModelRequest) => ScriptedResponse | Error);

export type TestModel = Model & {
  requests: ModelRequest[];
  // Queues the next responses in order. A function sees the request; an
  // Error is thrown as the provider would.
  script(...scripts: Script[]): void;
};

// A deterministic provider: answers only what a test scripted.
export const createTestModel = (): TestModel => {
  const requests: ModelRequest[] = [];
  const queue: Script[] = [];

  return {
    requests,
    script: (...scripts) => {
      queue.push(...scripts);
    },
    generate: async (request) => {
      requests.push(structuredClone(request));
      const script = queue.shift();
      if (!script) throw new Error("No scripted model response");
      const response = typeof script === "function" ? script(request) : script;
      if (response instanceof Error) throw response;
      return {
        text: response.text ?? "",
        toolCalls: response.toolCalls ?? [],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          ...response.usage,
        },
      };
    },
  };
};
