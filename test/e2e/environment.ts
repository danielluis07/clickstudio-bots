// Shared by playwright.config.ts (on Node) and scripts/seed-e2e.ts (on Bun),
// so it imports nothing from the app.

export const appPort = 3100;
export const fakeGraphPort = 3101;
export const appUrl = `http://localhost:${appPort}`;
export const fakeGraphUrl = `http://127.0.0.1:${fakeGraphPort}`;

const localHosts = ["localhost", "127.0.0.1", "[::1]"];

// The suite resets its own Tenants, so it only ever runs on a local database.
export const e2eDatabaseUrl = () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error("Set E2E_DATABASE_URL to a local Postgres database (docs/browser-tests.md).");
  }
  if (!localHosts.includes(new URL(url).hostname)) {
    throw new Error("E2E_DATABASE_URL must point at a local Postgres database.");
  }
  return url;
};

// Every variable the app reads. Meta points at the fake Graph server; every
// other service is switched off with an empty value, which overrides a
// developer's .env, so the suite never reaches a real Meta, Model, Ably,
// QStash, Sentry or Resend account.
export const e2eEnvironment = (databaseUrl: string): Record<string, string> => ({
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-not-for-production",
  APP_URL: appUrl,
  // Present for env validation only: no flow in the suite sends an email.
  RESEND_API_KEY: "e2e-resend-key",
  EMAIL_FROM: "ClickStudio Bots E2E <e2e@example.com>",
  META_APP_ID: "100000000000001",
  META_APP_SECRET: "e2e-meta-app-secret",
  META_WHATSAPP_SIGNUP_CONFIG_ID: "100000000000002",
  META_GRAPH_API_URL: fakeGraphUrl,
  WHATSAPP_TOKEN_KEY_VERSION: "e2e",
  WHATSAPP_TOKEN_KEYS: JSON.stringify({ e2e: Buffer.alloc(32, 1).toString("base64") }),
  META_WEBHOOK_VERIFY_TOKEN: "",
  ABLY_API_KEY: "",
  QSTASH_TOKEN: "",
  QSTASH_CURRENT_SIGNING_KEY: "",
  QSTASH_NEXT_SIGNING_KEY: "",
  SENTRY_DSN: "",
  CRON_SECRET: "",
  ANTHROPIC_API_KEY: "",
  AI_GATEWAY_API_KEY: "",
  AI_MODEL_ID: "",
});

// The access token the seed encrypts into each Channel; the fake Graph
// server sees it in the Authorization header of every send.
export const e2eAccessToken = "e2e-whatsapp-access-token";

export type E2eTenant = {
  name: string;
  ownerEmail: string;
  contactName: string;
  conversationId: string;
  inboundText: string;
};

// What scripts/seed-e2e.ts prints and the tests read.
export type E2eFixtures = {
  password: string;
  alfa: E2eTenant;
  beta: E2eTenant;
  invitation: { id: string; tenantName: string; email: string };
};
