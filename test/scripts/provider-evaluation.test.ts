import { expect, test } from "bun:test";
import { runEvaluation, scoreEvaluation } from "@/scripts/provider-evaluation/harness";
import { createEvaluationCorpus } from "@/scripts/provider-evaluation/corpus";
import type {
  EvaluationCase,
  EvaluationPricing,
  EvaluationTenant,
} from "@/scripts/provider-evaluation/types";
import { testBehaviour, testKnowledgeBase } from "@/test/support/bot";
import { createTestModel } from "@/test/support/model";

const tenant: EvaluationTenant = {
  id: "synthetic-barber",
  behaviour: testBehaviour,
  knowledgeBase: testKnowledgeBase,
};
const answer: EvaluationCase = {
  id: "price",
  tenantId: tenant.id,
  tags: ["price"],
  messages: [{ author: "contact", text: "Quanto custa o corte?" }],
  expected: { handoff: null, answerable: true, rubric: "State R$ 80; invent no discount." },
};
const pricing: EvaluationPricing = {
  currency: "BRL",
  inputPerMillion: 1,
  outputPerMillion: 2,
  cacheReadPerMillion: 0.1,
  cacheWritePerMillion: 1.25,
  source: "Synthetic test rates, not vendor prices",
  checkedAt: "2026-10-21",
};

test("a run uses the production Bot and reports measured usage, latency and projected cost", async () => {
  const model = createTestModel();
  model.script({
    text: "O corte custa R$ 80.",
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 1_000, cacheWriteTokens: 80 },
  });
  let elapsed = 0;
  const run = await runEvaluation({
    tenants: [tenant],
    cases: [answer],
    model,
    pricing,
    nowMs: () => (elapsed += 100),
  });

  expect(run.cases[0].outcome).toEqual({ kind: "answer", reply: "O corte custa R$ 80." });
  expect(run.cases[0].usage).toEqual({
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 1_000,
    cacheWriteTokens: 80,
    toolRoundTrips: 0,
  });
  expect(run.cases[0].latencyMs).toBe(100);
  expect(run.cases[0].cost).toBeCloseTo(0.0004);
  expect(scoreEvaluation(run).tenants[0].costAt5000Replies).toBeCloseTo(2);
  expect(scoreEvaluation(run).gates.grounding.pass).toBeNull();
  expect(scoreEvaluation(run).gates.inventedCommitments.pass).toBeNull();
});

test("a repaired call still fails the original schema and scope gates and counts both attempts", async () => {
  const model = createTestModel();
  model.script(
    {
      text: "Confirmado!",
      toolCalls: [{ id: "bad", name: "book", input: { tenantId: "another-tenant" } }],
      usage: { inputTokens: 100 },
    },
    {
      toolCalls: [{ id: "fixed", name: "handoff", input: { reason: "sem_resposta" } }],
      usage: { inputTokens: 200 },
    },
  );
  const run = await runEvaluation({
    tenants: [tenant],
    cases: [{ ...answer, expected: { ...answer.expected, handoff: "sem_resposta" } }],
    model,
    pricing,
  });
  const score = scoreEvaluation(run);

  expect(run.cases[0].outcome.kind).toBe("handoff");
  expect(run.cases[0].usage).toMatchObject({ inputTokens: 300, toolRoundTrips: 1 });
  expect(run.cases[0].attempts).toHaveLength(2);
  expect(score.gates.schemaValidity).toMatchObject({ value: 50, pass: false, samples: 2 });
  expect(score.gates.crossTenantCalls).toMatchObject({ value: 1, pass: false });
  expect(score.gates.outOfCatalogCalls).toMatchObject({ value: 1, pass: false });
  expect(score.gates.requiredHandoffs).toMatchObject({ value: 100, pass: true });
});

test("human judgments, Handoff reasons, unnecessary Handoffs and complete-reply p95 determine the gates", async () => {
  const model = createTestModel();
  model.script(
    { text: "O corte custa R$ 80." },
    { toolCalls: [{ id: "h", name: "handoff", input: { reason: "pedido_do_contato" } }] },
    { toolCalls: [{ id: "h2", name: "handoff", input: { reason: "sem_resposta" } }] },
  );
  const cases = [
    answer,
    {
      ...answer,
      id: "person",
      expected: { ...answer.expected, answerable: false, handoff: "pedido_do_contato" as const },
    },
    { ...answer, id: "unnecessary" },
  ];
  const times = [0, 7_000, 7_000, 15_000, 15_000, 23_100];
  const run = await runEvaluation({
    tenants: [tenant],
    cases,
    model,
    pricing,
    nowMs: () => times.shift()!,
  });
  const reviews = cases.map(({ id }) => ({
    caseId: id,
    inventedCommitment: false,
    grounded: id === "person" ? null : true,
    tone: 4,
    naturalPtBr: true,
    notes: "Checked against the fixture.",
  }));
  const score = scoreEvaluation(run, reviews);

  expect(score.gates.requiredHandoffs).toMatchObject({ value: 100, pass: true });
  expect(score.gates.unnecessaryHandoffs).toMatchObject({ value: 50, pass: false });
  expect(score.gates.grounding).toMatchObject({ value: 50, pass: false });
  expect(score.gates.inventedCommitments).toMatchObject({ value: 0, pass: true });
  expect(score.gates.tone).toMatchObject({ value: 4, pass: true });
  expect(score.gates.latency).toMatchObject({ value: 8_100, pass: false });
  expect(score.passed).toBe(false);
});

test("provider failures cannot satisfy required Handoffs or certify a complete cost measurement", async () => {
  const model = createTestModel();
  model.script(new Error("Provider unavailable"));
  const run = await runEvaluation({
    tenants: [tenant],
    cases: [{ ...answer, expected: { ...answer.expected, handoff: "sem_resposta" } }],
    model,
    pricing,
  });
  const score = scoreEvaluation(run);
  expect(run.cases[0].outcome).toMatchObject({ kind: "handoff", reason: "bot_indisponivel" });
  expect(score.gates.requiredHandoffs).toMatchObject({ value: 0, pass: false });
  expect(score.usageComplete).toBe(false);
  expect(score.gates.modelCost.pass).toBeNull();
});

test("the entire corpus and rates are checked before spending any provider tokens", async () => {
  const model = createTestModel();
  model.script({ text: "O corte custa R$ 80." });
  await expect(
    runEvaluation({
      tenants: [tenant],
      cases: [answer, { ...answer, id: "wrong", tenantId: "missing" }],
      model,
      pricing,
    }),
  ).rejects.toThrow("Unknown synthetic Tenant");
  expect(model.requests).toHaveLength(0);
  await expect(
    runEvaluation({ tenants: [tenant], cases: [answer, answer], model, pricing }),
  ).rejects.toThrow("Duplicate case");
  await expect(
    runEvaluation({
      tenants: [tenant],
      cases: [answer],
      model,
      pricing: { ...pricing, inputPerMillion: -1 },
    }),
  ).rejects.toThrow("rates");
});

test("published gate boundaries are inclusive, and p95 uses nearest rank instead of the maximum", async () => {
  const model = createTestModel();
  const cases: EvaluationCase[] = [];
  for (let i = 0; i < 30; i++) {
    const required = i < 20;
    const reason = i === 19 ? "pedido_do_contato" : "sem_resposta";
    const call = { id: `call-${i}`, name: "handoff", input: { reason } };
    cases.push({
      ...answer,
      id: `boundary-${i}`,
      expected: {
        ...answer.expected,
        answerable: !required,
        handoff: required ? "sem_resposta" : null,
      },
    });
    model.script({
      text: required || i === 29 ? "" : "O corte custa R$ 80.",
      toolCalls:
        i === 0
          ? Array.from({ length: 21 }, (_, n) => ({ ...call, id: `many-${n}` }))
          : required
            ? [call]
            : i === 29
              ? [
                  ...Array.from({ length: 9 }, (_, n) => ({ ...call, id: `optional-${n}` })),
                  { ...call, input: { reason, extra: "not in schema" } },
                ]
              : [],
    });
  }
  const times = cases.flatMap((_, i) => [i * 10_000, i * 10_000 + (i === 29 ? 9_000 : 8_000)]);
  const run = await runEvaluation({
    tenants: [tenant],
    cases,
    model,
    pricing,
    nowMs: () => times.shift()!,
  });
  const reviews = cases.map(({ id, expected }) => ({
    caseId: id,
    inventedCommitment: false,
    grounded: expected.answerable ? true : null,
    tone: 4,
    naturalPtBr: true,
    notes: "Boundary fixture",
  }));
  const score = scoreEvaluation(run, reviews);
  expect(score.gates.requiredHandoffs.value).toBe(95);
  expect(score.gates.unnecessaryHandoffs.value).toBe(10);
  expect(score.gates.grounding.value).toBe(90);
  expect(score.gates.schemaValidity.value).toBe(98);
  expect(score.gates.latency.value).toBe(8_000);
  expect(score.passed).toBe(true);
});

test("all 81 synthetic cases run with isolated Tenant facts, cold/warm prefixes and maximum-size Knowledge bases", async () => {
  const corpus = createEvaluationCorpus("test-run");
  const model = createTestModel();
  for (const item of corpus.cases) {
    model.script({ text: "Resposta sintética para testar o relatório." });
    if (item.toolRefusalProbe)
      model.script({ text: "Resposta sintética após recusa de ferramenta." });
  }
  const run = await runEvaluation({ ...corpus, model, pricing });
  expect(run.cases).toHaveLength(81);
  expect(scoreEvaluation(run).tenants.map(({ cases }) => cases)).toEqual([27, 27, 27]);
  expect(scoreEvaluation(run).recoveryCoverage).toEqual({ scheduled: 3, completed: 3 });
  const firstRequests = model.requests.filter(
    (request) => request.messages.at(-1)?.role !== "tool",
  );
  for (const tenant of corpus.tenants) {
    const cases = corpus.cases.filter(({ tenantId }) => tenantId === tenant.id);
    const indices = cases.map((item) => corpus.cases.indexOf(item));
    for (const index of indices) {
      expect(firstRequests[index].instructions).toContain(tenant.behaviour.businessName);
      for (const other of corpus.tenants.filter(({ id }) => id !== tenant.id)) {
        expect(firstRequests[index].knowledgeBase).not.toContain(
          other.knowledgeBase.faqs[0].answer,
        );
      }
    }
    const coldIndex = corpus.cases.findIndex(({ id }) => id === `${tenant.id}-cold-prefix`);
    expect(firstRequests[coldIndex].knowledgeBase).toBe(firstRequests[coldIndex + 1].knowledgeBase);
    expect(firstRequests[coldIndex].knowledgeBase).toContain(`test-run-${tenant.id}`);
    const maximum = corpus.cases.find(({ id }) => id === `${tenant.id}-maximum-kb`)!.knowledgeBase!;
    const characters = [
      ...maximum.faqs.flatMap(({ question, answer }) => [question, answer]),
      ...maximum.sections.flatMap(({ title, body }) => [title, body]),
    ].join("").length;
    expect(characters).toBe(30_000);
  }
});

test("a scoped argument cannot disappear from scores when production strips an unknown field", async () => {
  const model = createTestModel();
  model.script({
    toolCalls: [
      {
        id: "scoped",
        name: "handoff",
        input: { reason: "sem_resposta", extra: { tenant_id: "foreign" } },
      },
    ],
  });
  const run = await runEvaluation({ tenants: [tenant], cases: [answer], model, pricing });
  const score = scoreEvaluation(run);
  expect(run.cases[0].outcome.kind).toBe("handoff");
  expect(score.gates.crossTenantCalls).toMatchObject({ value: 1, pass: false });
  expect(score.gates.schemaValidity).toMatchObject({ value: 0, pass: false });
});

test("the most expensive Tenant determines the cost gate", async () => {
  const model = createTestModel();
  model.script(
    { text: "Resposta.", usage: { inputTokens: 2_000 } },
    { text: "Resposta.", usage: { inputTokens: 6_000 } },
  );
  const run = await runEvaluation({
    tenants: [tenant, { ...tenant, id: "second" }],
    cases: [answer, { ...answer, id: "second-price", tenantId: "second" }],
    model,
    pricing,
  });
  expect(scoreEvaluation(run).tenants.map(({ costAt5000Replies }) => costAt5000Replies)).toEqual([
    10, 30,
  ]);
  expect(scoreEvaluation(run).gates.modelCost).toMatchObject({ value: 30, pass: false });
});

test("partial human review stays pending, a known invented commitment fails, and stale review ids are rejected", async () => {
  const model = createTestModel();
  model.script({ text: "O corte custa R$ 80." }, { text: "Seu agendamento está confirmado." });
  const run = await runEvaluation({
    tenants: [tenant],
    cases: [answer, { ...answer, id: "second" }],
    model,
    pricing,
  });
  const review = {
    caseId: answer.id,
    inventedCommitment: false,
    grounded: true,
    tone: 5,
    naturalPtBr: true,
    notes: "Synthetic deterministic review",
  };
  expect(scoreEvaluation(run, [review]).gates.inventedCommitments.pass).toBeNull();
  expect(
    scoreEvaluation(run, [{ ...review, caseId: "second", inventedCommitment: true }]).gates
      .inventedCommitments,
  ).toMatchObject({ value: 1, pass: false });
  expect(() => scoreEvaluation(run, [review, review])).toThrow("duplicate review");
  expect(() => scoreEvaluation(run, [{ ...review, caseId: "different-run-case" }])).toThrow(
    "Unknown",
  );
  expect(() => scoreEvaluation(run, [{ ...review, tone: 6 }])).toThrow("Tone");
});

test("a marked refusal probe measures two real candidate calls without attributing the injected call to the provider", async () => {
  const model = createTestModel();
  model.script(
    { text: "O corte custa R$ 80.", usage: { inputTokens: 100 } },
    { text: "O corte custa R$ 80.", usage: { inputTokens: 200 } },
  );
  const times = [0, 5_000];
  const run = await runEvaluation({
    tenants: [tenant],
    cases: [{ ...answer, toolRefusalProbe: true }],
    model,
    pricing,
    nowMs: () => times.shift()!,
  });
  const result = run.cases[0];
  expect(result.attempts).toHaveLength(2);
  expect(result.attempts.map(({ response }) => response?.toolCalls)).toEqual([[], []]);
  expect(result.injectedRefusal).toMatchObject({
    name: "handoff",
    input: { reason: "synthetic_invalid_reason" },
  });
  expect(result.usage).toMatchObject({ inputTokens: 300, toolRoundTrips: 1 });
  expect(result.cost).toBeCloseTo(0.0003);
  expect(result.latencyMs).toBe(5_000);
  expect(model.requests[1].messages.at(-1)?.role).toBe("tool");
  expect(scoreEvaluation(run).recoveryCoverage).toEqual({ scheduled: 1, completed: 1 });
  expect(scoreEvaluation(run).gates.outOfCatalogCalls.value).toBe(0);
});
