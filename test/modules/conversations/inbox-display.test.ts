import { describe, expect, test } from "bun:test";
import {
  contactInitials,
  conversationStatusLine,
  isWaitingFilter,
  messagePreviewText,
} from "@/modules/conversations/hooks";

const contact = (names: { name?: string; appName?: string; profileName?: string }) => ({
  name: names.name ?? null,
  appName: names.appName ?? null,
  profileName: names.profileName ?? null,
  phone: "5521988887777",
});

describe("inbox display", () => {
  test("initials come from the first and last word of the shown name", () => {
    expect(contactInitials(contact({ name: "ana souza" }))).toBe("AS");
    expect(contactInitials(contact({ name: "Bruno de Lima Costa" }))).toBe("BC");
    expect(contactInitials(contact({ profileName: "Carla" }))).toBe("C");
    expect(contactInitials(contact({ appName: "  Élio  Prado " }))).toBe("ÉP");
  });

  test("a Contact known only by phone or by symbols shows a #", () => {
    expect(contactInitials(contact({}))).toBe("#");
    expect(contactInitials(contact({ profileName: "🙂" }))).toBe("#");
  });

  test("the status line says who answers, with the Handoff reason for the team", () => {
    expect(conversationStatusLine({ owner: "bot", handoffReason: null })).toBe("Bot respondendo");
    expect(conversationStatusLine({ owner: "team", handoffReason: null })).toBe("Equipe atendendo");
    expect(conversationStatusLine({ owner: "team", handoffReason: "no_answer" })).toBe(
      "O Bot não soube responder",
    );
  });

  test("the preview shows the latest message's text, caption or media kind", () => {
    const preview = (type: "text" | "image", text: string | null, revoked = false) =>
      messagePreviewText({ type, text, revoked });
    expect(preview("text", "Qual o horário?")).toBe("Qual o horário?");
    expect(preview("image", "Cardápio de hoje")).toBe("Cardápio de hoje");
    expect(preview("image", null)).toBe("Imagem");
    expect(preview("text", "Qual o horário?", true)).toBe("Mensagem apagada");
    expect(preview("text", null)).toBeNull();
    expect(messagePreviewText(null)).toBeNull();
  });

  test("the open filter is kept in the URL, and its old value still works", () => {
    expect(isWaitingFilter("abertas")).toBe(true);
    expect(isWaitingFilter("aguardando")).toBe(true);
    expect(isWaitingFilter("")).toBe(false);
  });
});
