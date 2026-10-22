import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BotUsageSummary } from "@/components/bot/bot-usage-summary";

test("the usage view shows pt-BR counts and the warning only from 80% onward", () => {
  const base = { period: "2026-10-01", limit: 5000, warningThreshold: 4000, exhausted: false };
  const below = renderToStaticMarkup(
    <BotUsageSummary usage={{ ...base, used: 3999, warning: false }} />,
  );
  expect(below).toContain("Respostas do Bot neste mês: 3.999 / 5.000");
  expect(below).not.toContain('role="alert"');
  const warning = renderToStaticMarkup(
    <BotUsageSummary usage={{ ...base, used: 4000, warning: true }} />,
  );
  expect(warning).toContain('role="alert"');
  expect(warning).toContain("80%");
  const exhausted = renderToStaticMarkup(
    <BotUsageSummary usage={{ ...base, used: 5001, warning: true, exhausted: true }} />,
  );
  expect(exhausted).toContain("5.001 / 5.000");
  expect(exhausted).toContain("Limite mensal atingido");
  expect(exhausted).toContain("sem cobrança adicional");
});
