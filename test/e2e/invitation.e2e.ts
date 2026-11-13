import { expect, test } from "./test";

test("an invited owner accepts the Terms, creates an account and lands on the Painel", async ({
  page,
  fixtures,
}) => {
  const { invitation } = fixtures;
  await page.goto(`/convite/${invitation.id}`);
  await expect(page.getByText(`Convite para ${invitation.tenantName}`)).toBeVisible();
  await expect(page.getByText(invitation.email)).toBeVisible();

  await page.getByLabel("Seu nome").fill("Carla Convite");
  await page.getByLabel("Crie uma senha").fill("senha-convite-123");
  await page.getByLabel("Confirme a senha").fill("senha-convite-123");

  // Without the Terms the form does not submit.
  const terms = page.getByRole("checkbox", { name: /Li e aceito os Termos de Uso/ });
  await expect(terms).not.toBeChecked();
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page).toHaveURL(`/convite/${invitation.id}`);

  await terms.click();
  await expect(terms).toBeChecked();
  await page.getByRole("button", { name: "Aceitar convite" }).click();

  await expect(page).toHaveURL("/painel");
  await expect(page.getByTitle(invitation.tenantName)).toBeVisible();

  // The invitation is used up.
  await page.goto(`/convite/${invitation.id}`);
  await expect(page.getByText("Convite indisponível")).toBeVisible();
});
