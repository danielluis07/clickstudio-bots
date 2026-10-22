import { z } from "zod";
import type { Model } from "@/modules/bot";
import type { EvaluationAttempt } from "@/scripts/provider-evaluation/types";

// Identity must come from the caller's proof, never from model arguments.
const scopeKeys = new Set([
  "tenant",
  "tenantid",
  "organizationid",
  "conversationid",
  "channelid",
  "contactid",
  "memberid",
  "scope",
]);
const hasScopeArgument = (input: unknown): boolean => {
  if (Array.isArray(input)) return input.some(hasScopeArgument);
  if (typeof input !== "object" || input === null) return false;
  return Object.entries(input).some(
    ([key, value]) =>
      scopeKeys.has(key.toLowerCase().replaceAll("_", "")) || hasScopeArgument(value),
  );
};

// Observe the production port before the core validates, strips arguments or
// retries. Never replace a bad response with a valid one for scoring.
export const observeModel = (model: Model, attempts: EvaluationAttempt[]): Model => ({
  async generate(request) {
    let response;
    try {
      response = await model.generate(request);
    } catch (error) {
      attempts.push({ response: null, failed: true, calls: [] });
      throw error;
    }
    attempts.push({
      response,
      failed: false,
      calls: response.toolCalls.map((call) => {
        const offered = request.tools.find(({ name }) => name === call.name);
        return {
          name: call.name,
          outOfCatalog: !offered,
          scopeAttempt: hasScopeArgument(call.input),
          schemaValid:
            !!offered && z.fromJSONSchema(offered.inputSchema).safeParse(call.input).success,
        };
      }),
    });
    return response;
  },
});
