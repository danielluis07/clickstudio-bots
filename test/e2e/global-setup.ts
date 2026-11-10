import { spawnSync } from "node:child_process";
import { e2eDatabaseUrl, e2eEnvironment } from "./environment";

// Runs on Node under Playwright. The seed needs Bun, so it runs as a child
// process; its last output line is the fixtures, handed to the tests through
// the environment, which Playwright's workers inherit.
export default function globalSetup() {
  const seed = spawnSync("bun", ["scripts/seed-e2e.ts"], {
    env: { ...process.env, ...e2eEnvironment(e2eDatabaseUrl()) },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (seed.status !== 0) {
    throw new Error(`The browser suite's seed failed:\n${seed.stderr}${seed.stdout}`);
  }
  process.env.E2E_FIXTURES = seed.stdout.trim().split("\n").at(-1);
}
