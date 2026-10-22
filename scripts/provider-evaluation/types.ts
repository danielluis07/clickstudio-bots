import type {
  BehaviourSettings,
  ContextMessage,
  HandoffReason,
  KnowledgeBase,
  ModelResponse,
  ModelToolCall,
  TurnOutcome,
  TurnUsage,
} from "@/modules/bot";

export type EvaluationTenant = {
  id: string;
  behaviour: BehaviourSettings;
  knowledgeBase: KnowledgeBase;
};
export type EvaluationCase = {
  id: string;
  tenantId: string;
  tags: string[];
  messages: Pick<ContextMessage, "author" | "text">[];
  knowledgeBase?: KnowledgeBase;
  toolRefusalProbe?: boolean;
  expected: { handoff: HandoffReason | null; answerable: boolean; rubric: string };
};

// Rates must be supplied from a dated price sheet, converted to BRL by the
// evaluator. Token buckets are disjoint, matching the production Model port.
export type EvaluationPricing = {
  currency: "BRL";
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
  source: string;
  checkedAt: string;
};

export type EvaluationAttempt = {
  response: ModelResponse | null;
  failed: boolean;
  calls: { name: string; schemaValid: boolean; outOfCatalog: boolean; scopeAttempt: boolean }[];
};
export type EvaluationResult = {
  id: string;
  tenantId: string;
  expected: EvaluationCase["expected"];
  outcome: TurnOutcome;
  attempts: EvaluationAttempt[];
  toolRefusalProbe: boolean;
  injectedRefusal: ModelToolCall | null;
  latencyMs: number;
  usage: TurnUsage;
  cost: number;
};
export type EvaluationRun = { cases: EvaluationResult[]; pricing: EvaluationPricing };
export type HumanReview = {
  caseId: string;
  inventedCommitment: boolean;
  grounded: boolean | null;
  tone: number;
  naturalPtBr: boolean;
  notes: string;
};
export type GateScore = {
  value: number | null;
  pass: boolean | null;
  threshold: string;
  samples: number;
};
