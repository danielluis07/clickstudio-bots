import { defineConfig, devices } from "@playwright/test";
import {
  appPort,
  appUrl,
  e2eDatabaseUrl,
  e2eEnvironment,
  fakeGraphUrl,
} from "./test/e2e/environment";

// The browser suite (docs/browser-tests.md): a production build of the app,
// a fake Meta Graph API and a seeded local database.
const ci = Boolean(process.env.CI);
const environment = { ...e2eEnvironment(e2eDatabaseUrl()) };

export default defineConfig({
  testDir: "./test/e2e",
  // Not *.spec.ts or *.test.ts, which `bun test` would also pick up.
  testMatch: "**/*.e2e.ts",
  globalSetup: "./test/e2e/global-setup.ts",
  // The flows share the seeded Tenants; one worker keeps them independent.
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: appUrl,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun test/e2e/fake-graph.ts",
      url: `${fakeGraphUrl}/__e2e/health`,
      reuseExistingServer: false,
    },
    {
      // Always a fresh production build, so Cache Components behave as deployed.
      command: `bun run build && bun run start --port ${appPort}`,
      url: `${appUrl}/entrar`,
      env: environment,
      timeout: 10 * 60 * 1000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
  ],
});
