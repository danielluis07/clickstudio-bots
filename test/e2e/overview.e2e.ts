import { expect, signIn, test } from "./test";

test("the owner's home page shows the stat ribbon, the charts and the rail", async ({
  page,
  fixtures,
}) => {
  const { alfa } = fixtures;
  await signIn(page, alfa.ownerEmail, fixtures.password);
  await expect(page).toHaveURL("/painel");
  await expect(page.getByTitle(alfa.name)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

  // The Bot is not live yet, so the rail starts with the owner's checklist.
  const rail = page.getByRole("complementary", { name: "Bot e equipe" });
  const firstSteps = rail.getByRole("region", { name: "Primeiros passos" });
  await expect(firstSteps).toBeVisible();
  await expect(firstSteps.getByRole("button", { name: "Ativar Bot" })).toBeDisabled();
  await expect(rail.getByRole("meter", { name: "Respostas do Bot neste mês" })).toBeVisible();
  await expect(rail.getByText("Neste mês", { exact: true })).toBeVisible();
  await expect(rail.getByRole("heading", { name: "Últimos Handoffs" })).toBeVisible();

  await expect(page.getByText("Conversas ativas", { exact: true })).toBeVisible();
  await expect(page.getByText("Atendidas só pelo Bot", { exact: true })).toBeVisible();
  await expect(page.getByText("Com Handoff", { exact: true })).toBeVisible();
  await expect(page.getByText("Contatos novos", { exact: true })).toBeVisible();
  // The seeded Contact wrote live today: one Active Conversation, whether or
  // not an earlier test handed it off.
  await expect(page.getByText(/^\d+ de 1 conversas$/)).toBeVisible();

  // One chart at a time, picked by tab.
  const daily = page.getByRole("tab", { name: "Conversas ativas por dia" });
  const hourly = page.getByRole("tab", { name: "Mensagens dos contatos por horário" });
  await expect(daily).toHaveAttribute("aria-selected", "true");
  await hourly.click();
  await expect(hourly).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("A faixa sombreada é o horário de atendimento.")).toBeVisible();

  const period = page.getByRole("group", { name: "Período" });
  await expect(period.getByRole("button", { name: "30 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await period.getByRole("button", { name: "7 dias" }).click();
  await expect(page).toHaveURL("/painel?periodo=7");
  await expect(period.getByRole("button", { name: "7 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The reply meter keeps counting the calendar month.
  await expect(rail.getByText("Neste mês", { exact: true })).toBeVisible();
});
