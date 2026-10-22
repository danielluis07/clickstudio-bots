import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Model } from "@/modules/bot";
import {
  evaluationConfigSchema,
  reviewFileSchema,
  type EvaluationConfig,
} from "@/scripts/provider-evaluation/config";
import { createEvaluationCorpus } from "@/scripts/provider-evaluation/corpus";
import { runEvaluation } from "@/scripts/provider-evaluation/harness";
import {
  printEvaluation,
  reviewTemplate,
  type EvaluationArtifact,
} from "@/scripts/provider-evaluation/report";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: true,
  options: {
    live: { type: "boolean" },
    config: { type: "string" },
    output: { type: "string" },
    score: { type: "string" },
    reviews: { type: "string" },
    help: { type: "boolean" },
  },
});

const loadModel = async (config: EvaluationConfig, configPath: string): Promise<Model> => {
  if (config.adapterModule) {
    const adapter = await import(
      pathToFileURL(resolve(dirname(configPath), config.adapterModule)).href
    );
    if (typeof adapter.createEvaluationModel !== "function")
      throw new Error(
        "Adapter must export createEvaluationModel({modelId}) returning the production Model port",
      );
    const model = await adapter.createEvaluationModel({ modelId: config.modelId });
    if (typeof model?.generate !== "function") throw new Error("Adapter did not return a Model");
    return model;
  }
  if (config.provider !== "anthropic")
    throw new Error("Supply adapterModule for this provider; built-in provider: anthropic");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for the manual live run");
  const { createAiSdkModel, createAnthropicLanguageModel } =
    await import("@/platform/ai-sdk-model");
  return createAiSdkModel({
    model: createAnthropicLanguageModel({ apiKey, modelId: config.modelId }),
  });
};

const main = async () => {
  if (values.help) {
    console.log(
      "Manual paid run: bun run evaluate:provider --live --config <config.json> --output <new-directory>",
    );
    console.log(
      "Offline human review: bun run evaluate:provider --score <run.json> --reviews <reviews.json>",
    );
    return;
  }
  if (values.score) {
    if (values.live || values.config || values.output || !values.reviews)
      throw new Error("Offline scoring requires only --score and --reviews");
    const artifact = JSON.parse(await readFile(values.score, "utf8")) as EvaluationArtifact;
    if (
      artifact.version !== 1 ||
      !artifact.complete ||
      artifact.run.cases.length !== artifact.corpus.cases.length
    )
      throw new Error("Expected a complete version-1 run artifact");
    const reviews = reviewFileSchema.parse(JSON.parse(await readFile(values.reviews, "utf8")));
    if (reviews.runId !== artifact.runId) throw new Error("Reviews belong to a different run");
    const score = printEvaluation(artifact, reviews.cases);
    // Never overwrite the original measurements or the human review file.
    await Bun.write(
      join(dirname(resolve(values.score)), "scored.json"),
      JSON.stringify({ runId: artifact.runId, reviews, score }, null, 2),
    );
    if (!score.passed) process.exitCode = 1;
    return;
  }
  if (!values.live || !values.config || !values.output || values.reviews)
    throw new Error("Use --live --config <config.json> --output <new-directory>, or --help");
  if (process.env.CI) throw new Error("Paid provider evaluation is manual and is refused in CI");
  const configPath = resolve(values.config);
  const config = evaluationConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
  const runId = crypto.randomUUID();
  const corpus = createEvaluationCorpus(runId);
  const model = await loadModel(config, configPath);
  const output = resolve(values.output);
  // A fresh directory prevents overwriting an earlier acceptance run.
  await mkdir(output, { recursive: false });
  const artifact: EvaluationArtifact = {
    version: 1,
    runId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    complete: false,
    revision: (await Bun.$`git rev-parse HEAD`.text()).trim(),
    workingTreeDirty: (await Bun.$`git status --porcelain`.text()).trim().length > 0,
    runtime: { bun: Bun.version, platform: process.platform, architecture: process.arch },
    corpusHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(corpus)).digest("hex"),
    config,
    corpus,
    run: { cases: [], pricing: config.pricing },
  };
  const save = () => Bun.write(join(output, "run.json"), JSON.stringify(artifact, null, 2));
  await save();
  artifact.run = await runEvaluation({
    ...corpus,
    model,
    pricing: config.pricing,
    onCase: async (result) => {
      artifact.run.cases.push(result);
      await save();
      console.log(
        `${artifact.run.cases.length}/${corpus.cases.length} ${result.id}: ${result.outcome.kind}, ${result.latencyMs.toFixed(0)} ms`,
      );
    },
  });
  artifact.complete = true;
  artifact.completedAt = new Date().toISOString();
  await save();
  await Bun.write(join(output, "reviews.json"), JSON.stringify(reviewTemplate(artifact), null, 2));
  const score = printEvaluation(artifact);
  await Bun.write(join(output, "scores.json"), JSON.stringify(score, null, 2));
  // A successful acquisition still needs human review; do not imply acceptance.
  if (Object.values(score.gates).some(({ pass }) => pass === false)) process.exitCode = 1;
};

await main().catch((error: unknown) => {
  // Provider error bodies can include secrets or request content. Their cases
  // are recorded as failures by the harness; only setup/scoring errors reach here.
  console.error(error instanceof Error ? error.message : "Evaluation setup failed");
  process.exitCode = 1;
});
