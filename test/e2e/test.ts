import { expect, test as base, type Page } from "@playwright/test";
import { appUrl, fakeGraphUrl, type E2eFixtures } from "./environment";

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

export const signIn = async (page: Page, email: string, password: string) => {
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
