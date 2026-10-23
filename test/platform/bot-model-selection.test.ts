import { expect, spyOn, test } from "bun:test";
import { createBotModel } from "@/platform/ai-sdk-model";

const request = {
  tools: [],
  instructions: "Reply OK.",
  knowledgeBase: "Synthetic test.",
  contact: "",
  messages: [{ role: "user" as const, text: "OK?" }],
};

test.each([
  { modelId: undefined, expected: "anthropic/claude-haiku-5.5", provider: "anthropic" },
  {
    modelId: "google/gemini-2.5-flash-lite",
    expected: "google/gemini-2.5-flash-lite",
    provider: "google",
  },
  {
    modelId: "anthropic/claude-haiku-4.5",
    expected: "anthropic/claude-haiku-4.5",
    provider: "anthropic",
  },
])(
  "Gateway selects $expected and refuses fallback after a provider error",
  async ({ modelId, expected, provider }) => {
    const network = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: { message: "Forbidden" } }, { status: 403 }),
    );
    try {
      const model = createBotModel({
        gatewayApiKey: "test-gateway",
        anthropicApiKey: "test-direct",
        modelId,
      });
      await expect(model!.generate(request)).rejects.toThrow();
      expect(network).toHaveBeenCalledTimes(1);
      const [, init] = network.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get("ai-language-model-id")).toBe(expected);
      expect(headers.get("authorization")).toBe("Bearer test-gateway");
      expect(JSON.parse(String(init?.body)).providerOptions).toEqual({
        gateway: { only: [provider] },
      });
    } finally {
      network.mockRestore();
    }
  },
);

test("direct Anthropic accepts a native model ID", async () => {
  const network = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { type: "error", error: { type: "permission_error", message: "Forbidden" } },
      { status: 403 },
    ),
  );
  try {
    const model = createBotModel({ anthropicApiKey: "test-direct", modelId: "claude-haiku-4-5" });
    await expect(model!.generate(request)).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
    const [url, init] = network.mock.calls[0];
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    expect(JSON.parse(String(init?.body)).model).toBe("claude-haiku-4-5");
  } finally {
    network.mockRestore();
  }
});

test("model IDs from the wrong route are rejected before a network call", () => {
  expect(() => createBotModel({ gatewayApiKey: "test", modelId: "claude-haiku-4-5" })).toThrow(
    "provider/model",
  );
  expect(() =>
    createBotModel({ anthropicApiKey: "test", modelId: "google/gemini-2.5-flash-lite" }),
  ).toThrow("Anthropic model ID");
  expect(() => createBotModel({ gatewayApiKey: "test", modelId: " " })).toThrow();
  expect(createBotModel({ modelId: "google/gemini-2.5-flash-lite" })).toBeNull();
});
