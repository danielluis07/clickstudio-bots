import { expect, signIn, test } from "./test";

test("the owner opens Configurações from the sidebar and finds Canal, Equipe and Termos aceitos", async ({
  page,
  fixtures,
}) => {
  const { alfa } = fixtures;
  await signIn(page, alfa.ownerEmail, fixtures.password);
  await expect(page).toHaveURL("/painel");
  await expect(page.getByRole("heading", { level: 1, name: alfa.name })).toBeVisible();
  // The home page no longer holds these sections.
  await expect(page.getByRole("heading", { name: "Equipe" })).toHaveCount(0);
  await expect(page.getByText("Canal do WhatsApp", { exact: true })).toHaveCount(0);

  const navigation = page.getByRole("navigation", { name: "Navegação do painel" });
  await navigation.getByRole("link", { name: "Configurações" }).click();
  await expect(page).toHaveURL("/painel/configuracoes");
  await expect(navigation.getByRole("link", { name: "Configurações" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();

  const channel = page.getByRole("region", { name: "Canal" });
  await expect(channel.getByText("Canal do WhatsApp", { exact: true })).toBeVisible();
  await expect(channel.getByText("WhatsApp Business: +55 11 90000-0000")).toBeVisible();

  const team = page.getByRole("region", { name: "Equipe" });
  await expect(
    team.getByRole("list", { name: "Membros" }).getByText(alfa.ownerEmail),
  ).toBeVisible();
  // Invitation controls are the owner's.
  await expect(team.getByRole("heading", { name: "Convidar membros" })).toBeVisible();

  const terms = page.getByRole("region", { name: "Termos aceitos" });
  await expect(terms.getByText(/^Aceitos por /).first()).toBeVisible();
});

test("the Canal section has an anchor other screens can link to", async ({ page, fixtures }) => {
  await signIn(page, fixtures.alfa.ownerEmail, fixtures.password);
  await expect(page).toHaveURL("/painel");

  await page.goto("/painel/configuracoes#canal");
  await expect(
    page.locator("#canal").getByText("Canal do WhatsApp", { exact: true }),
  ).toBeVisible();
});
