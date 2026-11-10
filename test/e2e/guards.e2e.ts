import { appUrl } from "./environment";
import { expect, test } from "./test";

for (const path of ["/painel", "/admin"]) {
  test(`a signed-out visit to ${path} redirects to /entrar`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(`/entrar?voltar=${encodeURIComponent(path)}`);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  // A forged cookie passes the optimistic proxy (ADR 0004); the page's own
  // guard must still refuse it.
  test(`a forged session cookie on ${path} is refused by the page guard`, async ({ page }) => {
    await page
      .context()
      .addCookies([
        { name: "better-auth.session_token", value: "forjado.assinatura", url: appUrl },
      ]);
    await page.goto(path);

    await expect(page).toHaveURL("/entrar");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });
}
