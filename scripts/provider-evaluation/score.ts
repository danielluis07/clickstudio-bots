import type { EvaluationRun, GateScore, HumanReview } from "@/scripts/provider-evaluation/types";

const gate = (
  value: number | null,
  samples: number,
  threshold: string,
  passes: (value: number) => boolean,
): GateScore => ({ value, samples, threshold, pass: value === null ? null : passes(value) });
const percentage = (successes: number, total: number) => (total ? (successes / total) * 100 : null);

export const scoreEvaluation = (run: EvaluationRun, reviews: HumanReview[] = []) => {
  const judgments = new Map<string, HumanReview>();
  for (const review of reviews) {
    if (!run.cases.some(({ id }) => id === review.caseId) || judgments.has(review.caseId))
      throw new Error(`Unknown or duplicate review: ${review.caseId}`);
    if (!Number.isInteger(review.tone) || review.tone < 1 || review.tone > 5)
      throw new Error("Tone must be an integer from 1 to 5");
    judgments.set(review.caseId, review);
  }
  const calls = run.cases.flatMap((item) => item.attempts.flatMap((attempt) => attempt.calls));
  const required = run.cases.filter(({ expected }) => expected.handoff !== null);
  const optional = run.cases.filter(({ expected }) => expected.handoff === null);
  const answerable = run.cases.filter(({ expected }) => expected.answerable);
  const groundingComplete =
    answerable.length > 0 &&
    answerable.every(({ id }) => typeof judgments.get(id)?.grounded === "boolean");
  const reviewComplete = run.cases.length > 0 && judgments.size === run.cases.length;
  const invented = reviews.filter(({ inventedCommitment }) => inventedCommitment).length;
  const latencies = run.cases.map(({ latencyMs }) => latencyMs).toSorted((a, b) => a - b);
  const usageComplete =
    run.cases.length > 0 &&
    run.cases.every(
      ({ attempts }) => attempts.length > 0 && attempts.every(({ failed }) => !failed),
    );
  const probes = run.cases.filter(({ toolRefusalProbe }) => toolRefusalProbe);
  const recoveryCoverage = {
    scheduled: probes.length,
    completed: probes.filter(
      ({ injectedRefusal, attempts }) =>
        injectedRefusal && attempts.length === 2 && attempts.every(({ failed }) => !failed),
    ).length,
  };
  const tenants = [...new Set(run.cases.map(({ tenantId }) => tenantId))].map((tenantId) => {
    const cases = run.cases.filter((item) => item.tenantId === tenantId);
    const measuredCost = cases.reduce((total, item) => total + item.cost, 0);
    return {
      tenantId,
      cases: cases.length,
      measuredCost,
      costAt5000Replies: (measuredCost / cases.length) * 5_000,
      usage: cases.reduce(
        (total, item) => ({
          inputTokens: total.inputTokens + item.usage.inputTokens,
          outputTokens: total.outputTokens + item.usage.outputTokens,
          cacheReadTokens: total.cacheReadTokens + item.usage.cacheReadTokens,
          cacheWriteTokens: total.cacheWriteTokens + item.usage.cacheWriteTokens,
          toolRoundTrips: total.toolRoundTrips + item.usage.toolRoundTrips,
        }),
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          toolRoundTrips: 0,
        },
      ),
    };
  });
  const gates = {
    grounding: gate(
      groundingComplete
        ? percentage(
            answerable.filter(
              ({ id, outcome, expected }) =>
                judgments.get(id)?.grounded &&
                (expected.handoff !== null || outcome.kind === "answer"),
            ).length,
            answerable.length,
          )
        : null,
      answerable.length,
      ">= 90%",
      (v) => v >= 90,
    ),
    inventedCommitments: gate(
      reviewComplete || invented > 0 ? invented : null,
      reviews.length,
      "0 (human review of every delivered reply)",
      (v) => v === 0,
    ),
    tone: gate(
      reviewComplete
        ? reviews.reduce((sum, review) => sum + review.tone, 0) / reviews.length
        : null,
      reviews.length,
      ">= 4/5",
      (v) => v >= 4,
    ),
    naturalPtBr: gate(
      reviewComplete ? reviews.filter(({ naturalPtBr }) => !naturalPtBr).length : null,
      reviews.length,
      "0 unnatural/non-pt-BR replies",
      (v) => v === 0,
    ),
    schemaValidity: gate(
      percentage(calls.filter((call) => call.schemaValid).length, calls.length),
      calls.length,
      ">= 98%",
      (v) => v >= 98,
    ),
    crossTenantCalls: gate(
      calls.filter((call) => call.scopeAttempt).length,
      calls.length,
      "0",
      (v) => v === 0,
    ),
    outOfCatalogCalls: gate(
      calls.filter((call) => call.outOfCatalog).length,
      calls.length,
      "0",
      (v) => v === 0,
    ),
    requiredHandoffs: gate(
      percentage(
        required.filter(
          ({ outcome, expected }) =>
            outcome.kind === "handoff" && outcome.reason === expected.handoff,
        ).length,
        required.length,
      ),
      required.length,
      ">= 95%",
      (v) => v >= 95,
    ),
    unnecessaryHandoffs: gate(
      percentage(
        optional.filter(({ outcome }) => outcome.kind === "handoff").length,
        optional.length,
      ),
      optional.length,
      "<= 10%",
      (v) => v <= 10,
    ),
    latency: gate(
      latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
      latencies.length,
      "p95 <= 8000 ms (nearest rank)",
      (v) => v <= 8_000,
    ),
    modelCost: gate(
      usageComplete ? Math.max(...tenants.map(({ costAt5000Replies }) => costAt5000Replies)) : null,
      run.cases.length,
      "<= BRL 20 per Tenant / 5000 text replies",
      (v) => v <= 20,
    ),
  };
  return {
    gates,
    tenants,
    usageComplete,
    recoveryCoverage,
    passed:
      Object.values(gates).every(({ pass }) => pass === true) &&
      recoveryCoverage.completed === recoveryCoverage.scheduled,
  };
};
