import { createBotCore, type Model, type ModelToolCall, type TurnUsage } from "@/modules/bot";
import type { ChannelRoute } from "@/modules/channels";
import type { EvaluationCase, EvaluationPricing, EvaluationResult, EvaluationRun, EvaluationTenant } from "@/scripts/provider-evaluation/types";
import { observeModel } from "@/scripts/provider-evaluation/observe";

export const runEvaluation = async ({ tenants, cases, model, pricing, nowMs = () => performance.now(), onCase }: {
  tenants: EvaluationTenant[];
  cases: EvaluationCase[];
  model: Model;
  pricing: EvaluationPricing;
  nowMs?: () => number;
  onCase?: (result: EvaluationResult) => Promise<void>;
}): Promise<EvaluationRun> => {
  if (!cases.length || !tenants.length) throw new Error("An evaluation requires synthetic Tenants and cases");
  const tenantIds = new Set(tenants.map(({ id }) => id));
  if (tenantIds.size !== tenants.length) throw new Error("Duplicate synthetic Tenant");
  const caseIds = new Set<string>();
  for (const item of cases) {
    if (!tenantIds.has(item.tenantId)) throw new Error(`Unknown synthetic Tenant: ${item.tenantId}`);
    if (caseIds.has(item.id)) throw new Error(`Duplicate case: ${item.id}`);
    if (item.messages.at(-1)?.author !== "contact") throw new Error(`Case must end with a Contact message: ${item.id}`);
    caseIds.add(item.id);
  }
  const rates = [pricing.inputPerMillion, pricing.outputPerMillion, pricing.cacheReadPerMillion, pricing.cacheWritePerMillion];
  if (pricing.currency !== "BRL" || rates.some((rate) => !Number.isFinite(rate) || rate < 0)) throw new Error("Supply finite, nonnegative BRL rates");
  const results: EvaluationRun["cases"] = [];
  for (const item of cases) {
    const tenant = tenants.find(({ id }) => id === item.tenantId);
    if (!tenant) throw new Error(`Unknown synthetic Tenant: ${item.tenantId}`);
    const at = new Date();
    const attempts: EvaluationRun["cases"][number]["attempts"] = [];
    const observed = observeModel(model, attempts);
    let injectedRefusal: ModelToolCall | null = null;
    let usage: TurnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, toolRoundTrips: 0 };
    const core = createBotCore({
      model: {
        async generate(request) {
          const response = await observed.generate(request);
          if (!item.toolRefusalProbe || injectedRefusal) return response;
          // Controlled recovery probe, never a claimed provider output. Save
          // the real first response unchanged above, then make the production
          // core refuse this synthetic call. Its normal retry calls the real
          // candidate again. Both actual requests retain their tokens/time.
          injectedRefusal = { id: "evaluation-refusal-probe", name: "handoff", input: { reason: "synthetic_invalid_reason" } };
          return { ...response, text: "", toolCalls: [injectedRefusal] };
        },
      },
      repository: {
        getBehaviour: async () => tenant.behaviour,
        getKnowledgeBase: async () => item.knowledgeBase ?? tenant.knowledgeBase,
        listRecentMessages: async () => item.messages.map((message, index) => ({ ...message, sentAt: new Date(at.getTime() - item.messages.length + index) })),
      },
      meter: { record: async (_scope, _at, recorded) => { usage = { ...recorded }; } },
      clock: { now: () => at },
    });
    // This proof belongs ONLY to the in-memory synthetic repository. No live
    // database, Channel, Contact, allowance or delivery adapter is reachable.
    const scope = { tenantId: tenant.id, channelId: `evaluation-${tenant.id}` } as ChannelRoute;
    const start = nowMs();
    const outcome = await core.respond({ scope, conversationId: item.id });
    const latencyMs = nowMs() - start;
    const cost = (usage.inputTokens * pricing.inputPerMillion + usage.outputTokens * pricing.outputPerMillion +
      usage.cacheReadTokens * pricing.cacheReadPerMillion + usage.cacheWriteTokens * pricing.cacheWritePerMillion) / 1_000_000;
    const result = { id: item.id, tenantId: tenant.id, expected: item.expected, outcome, attempts, toolRefusalProbe: item.toolRefusalProbe ?? false, injectedRefusal, latencyMs, usage, cost };
    results.push(result);
    await onCase?.(result);
  }
  return { cases: results, pricing };
};
