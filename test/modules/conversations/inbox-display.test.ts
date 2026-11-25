import { describe, expect, test } from "bun:test";
import { contactInitials, conversationStatusLine } from "@/modules/conversations/hooks";

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
});
