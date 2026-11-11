import { expect, signIn, test } from "./test";

test("the owner's home page shows the stats overview and its period selector", async ({
  page,
  fixtures,
}) => {
  const { alfa } = fixtures;
  await signIn(page, alfa.ownerEmail, fixtures.password);
  await expect(page).toHaveURL("/painel");
  await expect(page.getByRole("heading", { level: 1, name: alfa.name })).toBeVisible();

  // The Bot is not live yet, so the owner sees the checklist above the stats.
  const firstSteps = page.getByRole("region", { name: "Primeiros passos" });
  await expect(firstSteps).toBeVisible();
  await expect(firstSteps.getByRole("button", { name: "Ativar Bot" })).toBeDisabled();

  await expect(page.getByText("Conversas ativas", { exact: true })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Respostas do Bot neste mês" })).toBeVisible();
  await expect(page.getByText("Atendidas só pelo Bot", { exact: true })).toBeVisible();
  await expect(page.getByText("Contatos novos", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversas ativas por dia" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mensagens dos contatos por horário" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimos Handoffs" })).toBeVisible();

  const period = page.getByRole("group", { name: "Período" });
  await expect(period.getByRole("button", { name: "30 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Nos últimos 30 dias").first()).toBeVisible();
  await period.getByRole("button", { name: "7 dias" }).click();
  await expect(page).toHaveURL("/painel?periodo=7");
  await expect(page.getByText("Nos últimos 7 dias").first()).toBeVisible();
  // The reply meter keeps counting the calendar month.
  await expect(page.getByText("Neste mês", { exact: true })).toBeVisible();
});
