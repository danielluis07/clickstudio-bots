import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import type { Model, ModelRequest } from "@/modules/bot";
import { createAiSdkModel } from "@/platform/ai-sdk-model";

type Generated = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

const usage = {
  inputTokens: { total: 9_100, noCache: 60, cacheRead: 9_000, cacheWrite: 40 },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

const generated = (content: Generated["content"]): Generated => ({
  content,
  finishReason: { unified: "stop", raw: undefined },
  usage,
  warnings: [],
});

const request: ModelRequest = {
  tools: [
    {
      name: "handoff",
      description: "Pass to the team.",
      inputSchema: { type: "object", properties: { reason: { type: "string" } } },
    },
  ],
  instructions: "Behaviour",
  knowledgeBase: "# Knowledge base",
  messages: [
    { role: "user", text: "Quanto custa?" },
    {
      role: "assistant",
      text: "Um momento.",
      toolCalls: [{ id: "call-1", name: "handoff", input: "not json" }],
    },
    { role: "tool", results: [{ callId: "call-1", name: "handoff", error: "Invalid input" }] },
  ],
};

describe("AI SDK model", () => {
  test("sends tools, then instructions, then the Knowledge base as the cached prefix", async () => {
    const provider = new MockLanguageModelV4({
      doGenerate: async () => generated([{ type: "text", text: "Oi" }]),
    });
    const model: Model = createAiSdkModel({ model: provider });

    await model.generate(request);

    const [call] = provider.doGenerateCalls;
    expect(call.tools).toEqual([
      {
        type: "function",
        name: "handoff",
        description: "Pass to the team.",
        inputSchema: request.tools[0].inputSchema,
      },
    ]);
    expect(call.prompt.slice(0, 2)).toEqual([
      { role: "system", content: "Behaviour" },
      {
        role: "system",
        content: "# Knowledge base",
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
    ]);
    expect(call.prompt.slice(2)).toMatchObject([
      { role: "user", content: [{ type: "text", text: "Quanto custa?" }] },
      {
        role: "assistant",
        // An unparsed input is replayed as an empty object, which providers accept.
        content: [
          { type: "text", text: "Um momento." },
          { type: "tool-call", toolCallId: "call-1", toolName: "handoff", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "handoff",
            output: { type: "error-text", value: "Invalid input" },
          },
        ],
      },
    ]);
  });

  test("returns text, every tool call as sent, and token usage split by cache", async () => {
    const provider = new MockLanguageModelV4({
      doGenerate: async () =>
        generated([
          { type: "text", text: "O corte custa R$ 80." },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "handoff",
            input: JSON.stringify({ reason: "sem_resposta", tenantId: "x" }),
          },
          { type: "tool-call", toolCallId: "call-2", toolName: "send_payment", input: "{}" },
          { type: "tool-call", toolCallId: "call-3", toolName: "handoff", input: "not json" },
        ]),
    });

    expect(await createAiSdkModel({ model: provider }).generate(request)).toEqual({
      text: "O corte custa R$ 80.",
      toolCalls: [
        { id: "call-1", name: "handoff", input: { reason: "sem_resposta", tenantId: "x" } },
        { id: "call-2", name: "send_payment", input: {} },
        { id: "call-3", name: "handoff", input: "not json" },
      ],
      usage: { inputTokens: 60, outputTokens: 20, cacheReadTokens: 9_000, cacheWriteTokens: 40 },
    });
  });

  test("a provider error rejects after one attempt", async () => {
    const provider = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("529 overloaded");
      },
    });

    await expect(createAiSdkModel({ model: provider }).generate(request)).rejects.toThrow(
      "529 overloaded",
    );
    expect(provider.doGenerateCalls).toHaveLength(1);
  });

  test("a slow provider rejects at the timeout", async () => {
    const provider = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason));
        }),
    });

    await expect(
      createAiSdkModel({ model: provider, timeoutMs: 20 }).generate(request),
    ).rejects.toThrow();
  });
});
