import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialNotice } from "@/components/billing/trial-notice";

test("a Tenant whose Trial is not ending shows no banner", () => {
  expect(renderToStaticMarkup(<TrialNotice daysLeft={null} isOwner />)).toBe("");
});

test("the owner is told how many days the Trial has left and offered the billing page", () => {
  const banner = renderToStaticMarkup(<TrialNotice daysLeft={5} isOwner />);

  expect(banner).toContain('role="alert"');
  expect(banner).toContain("Seu teste termina em 5 dias");
  expect(banner).toContain("Depois disso, o Bot para de responder até o plano ser assinado.");
  expect(banner).toContain('href="/painel/assinatura"');
  expect(banner).toContain(">Assine o plano</a> para o Bot continuar respondendo.");
});

test("on the last day the banner says one day", () => {
  expect(renderToStaticMarkup(<TrialNotice daysLeft={1} isOwner />)).toContain(
    "Seu teste termina em 1 dia<",
  );
});

test("other Members see the days left without the call to action", () => {
  const banner = renderToStaticMarkup(<TrialNotice daysLeft={7} isOwner={false} />);

  expect(banner).toContain("Seu teste termina em 7 dias");
  expect(banner).toContain(
    "Peça ao responsável pelo negócio para assinar o plano e o Bot continuar respondendo.",
  );
  expect(banner).not.toContain("/painel/assinatura");
});
