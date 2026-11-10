import { e2eAccessToken } from "./environment";
import { expect, fakeGraphSends, signIn, test } from "./test";

test.beforeEach(async ({ page, fixtures }) => {
  await signIn(page, fixtures.alfa.ownerEmail, fixtures.password);
  await expect(page).toHaveURL("/painel");
});

test("a Member opens a Conversation and their reply appears", async ({ page, fixtures }) => {
  const { alfa } = fixtures;
  await page.goto("/painel/conversas");
  await page.getByRole("button", { name: new RegExp(alfa.contactName) }).click();
  await expect(page).toHaveURL(`/painel/conversas?conversa=${alfa.conversationId}`);
  await expect(page.getByText(alfa.inboundText)).toBeVisible();

  const reply = `Abrimos sim, das 9h às 13h. (${Date.now()})`;
  await page.getByRole("textbox", { name: "Mensagem" }).fill(reply);
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText(reply)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveValue("");
  await expect(page.getByText("Não foi possível enviar a mensagem.")).toHaveCount(0);
  // It reached the fake Meta, with the Channel's decrypted token.
  expect(await fakeGraphSends()).toContainEqual({
    phoneNumberId: "990000000000011",
    authorization: `Bearer ${e2eAccessToken}`,
    to: "5511988880001",
    text: reply,
  });
});

test("a Member cannot open another Tenant's Conversation by id", async ({ page, fixtures }) => {
  await page.goto(`/painel/conversas?conversa=${fixtures.beta.conversationId}`);

  await expect(
    page.getByText("Não foi possível abrir esta conversa. Ela pode não existir mais."),
  ).toBeVisible();
  await expect(page.getByText(fixtures.beta.inboundText)).toHaveCount(0);
  await expect(page.getByText(fixtures.beta.contactName)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toHaveCount(0);
});
