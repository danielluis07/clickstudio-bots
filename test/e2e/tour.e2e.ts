import { expect, resetTour, signIn, test } from "./test";

const tourChecked = (url: string) => url.includes("tenancy.tour");

test("a new owner gets the Tour once on the Painel, and Ver tour replays it", async ({
  page,
  fixtures,
}) => {
  const { alfa } = fixtures;
  await resetTour(alfa.ownerEmail);
  await signIn(page, alfa.ownerEmail, fixtures.password);
  await expect(page).toHaveURL("/painel");

  const welcome = page.getByRole("dialog", { name: "Boas-vindas ao painel" });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByText("Passo 1 de 10")).toBeVisible();
  await welcome.getByRole("button", { name: "Começar" }).click();

  const overview = page.getByRole("dialog", { name: "Visão geral" });
  await expect(overview.getByText("Passo 2 de 10")).toBeVisible();
  await expect(overview.getByRole("button", { name: "Voltar" })).toBeVisible();
  await expect(overview.getByRole("button", { name: "Próximo" })).toBeVisible();
  const marked = page.waitForResponse((response) => response.url().includes("markTourSeen"));
  await overview.getByRole("button", { name: "Pular tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await marked).ok()).toBe(true);

  // Skipped once, it never opens by itself again.
  const checked = page.waitForResponse((response) => tourChecked(response.url()));
  await page.reload();
  await checked;
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // "Ver tour" replays it from any page, on the Painel.
  const navigation = page.getByRole("navigation", { name: "Navegação do painel" });
  await navigation.getByRole("link", { name: "Conversas" }).click();
  await expect(page).toHaveURL(/\/painel\/conversas/);
  await page.getByRole("button", { name: "Ver tour" }).click();
  await expect(page).toHaveURL("/painel");
  await expect(page.getByRole("dialog", { name: "Boas-vindas ao painel" })).toBeVisible();
});
