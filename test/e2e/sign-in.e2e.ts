import { expect, signIn, test } from "./test";

test("an owner signs in and lands on the Painel", async ({ page, fixtures }) => {
  await signIn(page, fixtures.alfa.ownerEmail, fixtures.password);

  await expect(page).toHaveURL("/painel");
  await expect(page.getByTitle(fixtures.alfa.name)).toBeVisible();
});

test("a wrong password shows the pt-BR error and stays signed out", async ({ page, fixtures }) => {
  await signIn(page, fixtures.alfa.ownerEmail, "senha-errada-123");

  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page).toHaveURL("/entrar");
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/entrar\?voltar=%2Fpainel$/);
});
