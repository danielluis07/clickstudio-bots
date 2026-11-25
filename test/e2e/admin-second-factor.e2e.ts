import { totpCode } from "../support/totp";
import { expect, resetAdminSecondFactor, signIn, test } from "./test";

test.beforeEach(async ({ fixtures }) => {
  await resetAdminSecondFactor(fixtures.adminEmail);
});

test("an administrator sets up a second factor before reaching /admin, then signs in with a code", async ({
  page,
  fixtures,
}) => {
  await signIn(page, fixtures.adminEmail, fixtures.password);
  await expect(page).toHaveURL("/entrar/segundo-fator");
  await page.goto("/admin");
  await expect(page).toHaveURL("/entrar/segundo-fator");

  await page.getByLabel("Senha").fill(fixtures.password);
  await page.getByRole("button", { name: "Continuar" }).click();
  const setupKey = await page.getByLabel("Chave de configuração").innerText();
  await expect(page.getByLabel("Códigos de recuperação").getByRole("listitem")).toHaveCount(10);
  await page.getByLabel("Digite o código de 6 dígitos do aplicativo").fill(totpCode(setupKey));
  await page.getByRole("button", { name: "Ativar e continuar" }).click();
  await expect(page).toHaveURL("/admin");

  // The password alone no longer opens a session.
  await page.context().clearCookies();
  await signIn(page, fixtures.adminEmail, fixtures.password);
  await expect(page).toHaveURL("/entrar/verificacao");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/entrar\?voltar=%2Fadmin$/);

  await signIn(page, fixtures.adminEmail, fixtures.password);
  await page.getByLabel("Código").fill("000000");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByText("Código incorreto.")).toBeVisible();
  await page.getByLabel("Código").fill(totpCode(setupKey));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL("/admin");
});

test("an owner never sees the second-factor setup", async ({ page, fixtures }) => {
  await signIn(page, fixtures.alfa.ownerEmail, fixtures.password);
  await expect(page).toHaveURL("/painel");

  await page.goto("/entrar/segundo-fator");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByText("Proteja a administração")).toHaveCount(0);
});
