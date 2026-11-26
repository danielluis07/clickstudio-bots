import { expect, test as base, type Page } from "@playwright/test";
import { Client } from "pg";
import { appUrl, e2eDatabaseUrl, fakeGraphUrl, type E2eFixtures } from "./environment";

const appOrigin = new URL(appUrl).origin;

// Every browser test gets the seeded fixtures, and a page that can reach only
// the app: a request to any other origin (the Facebook SDK, a font CDN) is
// refused, so no flow can depend on, or call, a real external service.
export const test = base.extend<{ fixtures: E2eFixtures }>({
  fixtures: async ({}, provide) => {
    const fixtures = process.env.E2E_FIXTURES;
    if (!fixtures) throw new Error("The global setup did not seed the browser suite.");
    await provide(JSON.parse(fixtures) as E2eFixtures);
  },
  page: async ({ page }, provide) => {
    await page.route(
      (url) => url.origin !== appOrigin,
      (route) => route.abort("blockedbyclient"),
    );
    await provide(page);
  },
});

export { expect };

// Each test signs in on its own, so the sign-in attempt limit (#77) never
// carries over from earlier tests or retries in the same run.
const resetSignInAttempts = async () => {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query("delete from sign_in_attempt");
  } finally {
    await client.end();
  }
};

// Makes the owner new to the Tour again, as a Member who just joined.
export const resetTour = async (email: string) => {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      `update member set tour_seen_at = null where user_id = (select id from "user" where email = $1)`,
      [email],
    );
  } finally {
    await client.end();
  }
};

export const signIn = async (page: Page, email: string, password: string) => {
  await resetSignInAttempts();
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

type FakeSend = { phoneNumberId: string; authorization: string | null; to: string; text: string };

// What the fake Graph server received, in order.
export const fakeGraphSends = async (): Promise<FakeSend[]> => {
  const response = await fetch(`${fakeGraphUrl}/__e2e/sends`);
  return (await response.json()) as FakeSend[];
};
