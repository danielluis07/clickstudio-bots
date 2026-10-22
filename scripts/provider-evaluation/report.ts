import { scoreEvaluation } from "@/scripts/provider-evaluation/harness";
import type { EvaluationConfig } from "@/scripts/provider-evaluation/config";
import type { createEvaluationCorpus } from "@/scripts/provider-evaluation/corpus";
import type { EvaluationRun, HumanReview } from "@/scripts/provider-evaluation/types";

export type EvaluationArtifact = {
  version: 1;
  runId: string;
  startedAt: string;
  completedAt: string | null;
  complete: boolean;
  revision: string;
  workingTreeDirty: boolean;
  runtime: { bun: string; platform: string; architecture: string };
  corpusHash: string;
  config: EvaluationConfig;
  corpus: ReturnType<typeof createEvaluationCorpus>;
  run: EvaluationRun;
};

export const reviewTemplate = (artifact: EvaluationArtifact) => ({
  runId: artifact.runId,
  reviewer: null,
  reviewedAt: null,
  cases: artifact.run.cases.map(({ id }) => ({
    caseId: id,
    inventedCommitment: null,
    grounded: null,
    tone: null,
    naturalPtBr: null,
    notes: "",
  })),
});

export const printEvaluation = (artifact: EvaluationArtifact, reviews: HumanReview[] = []) => {
  const score = scoreEvaluation(artifact.run, reviews);
  console.log(`Run ${artifact.runId}: ${artifact.config.provider} / ${artifact.config.modelId}`);
  console.log(
    `Region: ${artifact.config.hostingRegion}; complete: ${artifact.complete}; cases: ${artifact.run.cases.length}`,
  );
  console.table(
    Object.entries(score.gates).map(([name, gate]) => ({
      gate: name,
      value: gate.value,
      samples: gate.samples,
      threshold: gate.threshold,
      status: gate.pass === null ? "PENDING" : gate.pass ? "PASS" : "FAIL",
    })),
  );
  console.table(
    score.tenants.map(({ tenantId, cases, measuredCost, costAt5000Replies, usage }) => ({
      tenantId,
      cases,
      measuredBRL: measuredCost,
      modelBRLAt5000: costAt5000Replies,
      ...usage,
    })),
  );
  console.log(
    `Provider errors: ${artifact.run.cases.reduce((sum, item) => sum + item.attempts.filter(({ failed }) => failed).length, 0)}; usage complete: ${score.usageComplete}`,
  );
  console.log(
    `Controlled tool-refusal recovery probes: ${score.recoveryCoverage.completed}/${score.recoveryCoverage.scheduled}; both real calls are metered, the injected call is excluded from provider call scores.`,
  );
  console.log(
    "Voice notes: PENDING (15 authorized slots); transcription usage/cost is not included in model-only projections.",
  );
  console.log(
    `Text evaluation: ${score.passed && artifact.complete ? "PASS" : "FAIL OR PENDING"}. Hosting-region evidence and audio review remain separate launch evidence.`,
  );
  return score;
};
