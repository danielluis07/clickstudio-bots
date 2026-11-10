import { expect, test } from "bun:test";

test("the main ruleset requires the check name published by the CI workflow", async () => {
  const ruleset = await Bun.file(`${import.meta.dir}/../.github/rulesets/main.json`).json();
  const workflow = Bun.YAML.parse(
    await Bun.file(`${import.meta.dir}/../.github/workflows/ci.yml`).text(),
  ) as {
    jobs: Record<string, { name?: string }>;
  };
  const contexts = Object.entries(workflow.jobs).map(([id, job]) => job.name ?? id);
  const statusRule = ruleset.rules.find(
    (rule: { type: string }) => rule.type === "required_status_checks",
  );
  expect(statusRule).toBeDefined();
  expect(statusRule.parameters.required_status_checks.length).toBeGreaterThan(0);
  for (const { context } of statusRule.parameters.required_status_checks)
    expect(contexts).toContain(context);
});

// The direct `@better-auth/core` pin keeps one copy of it in the lockfile, so
// `better-auth`, which pins its own core exactly, must move with it.
test("better-auth and @better-auth/core are pinned to one exact version", async () => {
  const { dependencies } = await Bun.file(`${import.meta.dir}/../package.json`).json();
  expect(dependencies["better-auth"]).toMatch(/^\d+\.\d+\.\d+$/);
  expect(dependencies["@better-auth/core"]).toBe(dependencies["better-auth"]);
});
