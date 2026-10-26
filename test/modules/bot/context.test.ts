import { expect, test } from "bun:test";
import { liveTurnContext } from "@/modules/bot";
import type { BotTurnMessage } from "@/modules/conversations";

const at = (minute: number) => new Date(`2026-10-22T12:${String(minute).padStart(2, "0")}:00Z`);

const row = (id: string, minute: number, fields: Partial<BotTurnMessage> = {}): BotTurnMessage => ({
  id,
  wamid: null,
  direction: "inbound",
  origin: "contact",
  authorName: null,
  status: null,
  type: "text",
  text: id,
  sentAt: at(minute),
  imported: false,
  editedAt: null,
  revokedAt: null,
  ...fields,
});

test("a burst of unanswered messages becomes one Contact message", () => {
  const current = [row("Oi", 1), row("Quanto custa?", 2)];
  const context = liveTurnContext({ current, history: current }, at(3));
  expect(context).toEqual([{ author: "contact", text: "Oi\n\nQuanto custa?", sentAt: at(3) }]);
});

test("earlier messages replay before the burst, with their authors", () => {
  const history = [
    row("Bom dia", 1),
    row("Olá!", 2, { direction: "outbound", origin: "bot" }),
    row("Já te respondo", 3, { direction: "outbound", origin: "dashboard" }),
    row("E o preço?", 4),
  ];
  const context = liveTurnContext({ current: [history[3]!], history }, at(5));
  expect(context?.map(({ author, text }) => [author, text])).toEqual([
    ["contact", "Bom dia"],
    ["bot", "Olá!"],
    ["member", "Já te respondo"],
    ["contact", "E o preço?"],
  ]);
});

test("the burst follows a reply sent while it was written", () => {
  const current = [row("Pergunta", 1)];
  const history = [...current, row("Resposta", 2, { direction: "outbound", origin: "bot" })];
  const context = liveTurnContext({ current, history }, at(1));
  expect(context?.map(({ text }) => text)).toEqual(["Resposta", "Pergunta"]);
  expect(context?.at(-1)?.sentAt).toEqual(at(2));
});

test("a caption is context, never evidence of the attachment", () => {
  const current = [row("Foto", 1, { type: "image", text: "Esse corte?" })];
  expect(liveTurnContext({ current, history: current }, at(2))?.at(-1)?.text).toBe(
    "[Unsupported image attachment; caption only]\nEsse corte?",
  );
});

test("revoked messages are left out, and nothing is left to answer without text", () => {
  const revoked = row("Apagada", 1, { text: null, revokedAt: at(2) });
  const media = row("Áudio", 2, { type: "audio", text: null });
  expect(liveTurnContext({ current: [revoked, media], history: [revoked, media] }, at(3))).toBe(
    null,
  );
  const answer = row("Oi", 3);
  expect(
    liveTurnContext({ current: [answer], history: [revoked, answer] }, at(4))?.map(
      ({ text }) => text,
    ),
  ).toEqual(["Oi"]);
});
