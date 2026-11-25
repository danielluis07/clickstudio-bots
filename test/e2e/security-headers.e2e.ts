import { appUrl } from "./environment";
import { expect, test } from "./test";

for (const path of ["/entrar", "/privacidade"]) {
  test(`${path} responds with the security headers`, async ({ page }) => {
    const response = await page.goto(path);
    const headers = response!.headers();

    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
}

test("the dashboard does not load in a frame from another origin", async ({ page }) => {
  // setContent waits for the load event, which waits for the frame's own.
  await page.setContent(`<iframe title="embutido" src="${appUrl}/entrar"></iframe>`);
  expect(page.frames()).toHaveLength(2);

  const frame = page.frameLocator('iframe[title="embutido"]');
  await expect(frame.getByRole("button", { name: "Entrar" })).toHaveCount(0);
});

test("the sign-in page hydrates under the policy, with no violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("ninguem@e2e.example.com");
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  expect(violations).toEqual([]);
});
