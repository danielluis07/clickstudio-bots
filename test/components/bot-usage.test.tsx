import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BotUsageAlert } from "@/components/bot/bot-usage-alert";
import { BotReplyMeter } from "@/components/overview/bot-reply-meter";

const base = { period: "2026-10-01", limit: 5000, warningThreshold: 4000, exhausted: false };

test("the reply meter shows pt-BR counts against the monthly limit", () => {
  const below = renderToStaticMarkup(
    <BotReplyMeter usage={{ ...base, used: 3999, warning: false }} />,
  );
  expect(below).toContain("Respostas do Bot");
  expect(below).toContain("3.999");
  expect(below).toContain(" / 5.000");
  expect(below).toContain('role="meter"');
  expect(below).toContain('aria-valuenow="3999"');
  expect(below).toContain("Neste mês");

  const warning = renderToStaticMarkup(
    <BotReplyMeter usage={{ ...base, used: 4100, warning: true }} />,
  );
  expect(warning).toContain("82% do limite deste mês");
  expect(warning).toContain("bg-amber-500");

  const exhausted = renderToStaticMarkup(
    <BotReplyMeter usage={{ ...base, used: 5001, warning: true, exhausted: true }} />,
  );
  expect(exhausted).toContain("5.001");
  expect(exhausted).toContain("Limite do mês atingido");
  expect(exhausted).toContain('aria-valuenow="5000"');
  expect(exhausted).toContain("width:100%");
});

test("the usage alert appears only from 80% onward", () => {
  expect(
    renderToStaticMarkup(<BotUsageAlert usage={{ ...base, used: 3999, warning: false }} />),
  ).toBe("");
  const warning = renderToStaticMarkup(
    <BotUsageAlert usage={{ ...base, used: 4000, warning: true }} />,
  );
  expect(warning).toContain('role="alert"');
  expect(warning).toContain("80%");
  const exhausted = renderToStaticMarkup(
    <BotUsageAlert usage={{ ...base, used: 5001, warning: true, exhausted: true }} />,
  );
  expect(exhausted).toContain("Limite mensal atingido");
  expect(exhausted).toContain("sem cobrança adicional");
});
