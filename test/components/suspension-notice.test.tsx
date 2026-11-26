import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SuspensionNotice } from "@/components/billing/suspension-notice";

test("a Tenant that is not Suspended shows no banner", () => {
  expect(renderToStaticMarkup(<SuspensionNotice suspended={false} isOwner />)).toBe("");
});

test("the owner of a Suspended Tenant is told the Bot stopped and offered the billing page", () => {
  const banner = renderToStaticMarkup(<SuspensionNotice suspended isOwner />);

  expect(banner).toContain('role="alert"');
  expect(banner).toContain("O Bot parou de responder: o período de teste terminou");
  expect(banner).toContain("As conversas, os dados e as respostas da equipe continuam funcionando");
  expect(banner).toContain('href="/painel/assinatura"');
  expect(banner).toContain(">Assine o plano</a> para o Bot voltar a responder na hora.");
});

test("other Members of a Suspended Tenant see the banner without the call to action", () => {
  const banner = renderToStaticMarkup(<SuspensionNotice suspended isOwner={false} />);

  expect(banner).toContain("O Bot parou de responder: o período de teste terminou");
  expect(banner).toContain("Peça ao responsável pelo negócio para assinar o plano");
  expect(banner).not.toContain("/painel/assinatura");
});
