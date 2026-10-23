import { expect, spyOn, test } from "bun:test";
import { createDoctorDependencies } from "@/scripts/doctor/adapters";

test.each([
  { modelId: undefined, configuredModelId: "google/gemini-2.5-flash-lite" },
  { modelId: "google/gemini-2.5-flash-lite", configuredModelId: "anthropic/claude-haiku-5.5" },
])(
  "the probe honors the environment model and a one-off override ($modelId)",
  async ({ modelId, configuredModelId }) => {
    const network = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        content: [{ type: "text", text: "OK" }],
        finishReason: { unified: "stop" },
        usage: { inputTokens: { total: 20, noCache: 20 }, outputTokens: { total: 1 } },
        warnings: [],
      }),
    );
    try {
      const dependencies = createDoctorDependencies();
      const environment = {
        AI_GATEWAY_API_KEY: "test-gateway",
        ANTHROPIC_API_KEY: "test-direct",
        AI_MODEL_ID: configuredModelId,
      };
      await dependencies.probeProvider(environment, modelId);
      expect(network).toHaveBeenCalledTimes(1);
      const [url, init] = network.mock.calls[0];
      expect(String(url)).toBe("https://ai-gateway.vercel.sh/v4/ai/language-model");
      const headers = new Headers(init?.headers);
      expect(headers.get("ai-language-model-id")).toBe("google/gemini-2.5-flash-lite");
      expect(headers.get("authorization")).toBe("Bearer test-gateway");
      const body = JSON.parse(String(init?.body));
      expect(body.maxOutputTokens).toBe(modelId ? 32 : 1024);
      if (!modelId) expect(body.providerOptions).toEqual({ gateway: { only: ["google"] } });
      expect(body.prompt).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: "Synthetic test only. No Contact data.",
          }),
        ]),
      );
      network.mockResolvedValue(
        Response.json({ error: { message: "Forbidden" } }, { status: 403 }),
      );
      await expect(dependencies.probeProvider(environment, modelId)).rejects.toThrow();
      expect(network).toHaveBeenCalledTimes(2);
    } finally {
      network.mockRestore();
    }
  },
);
