import { describe, expect, test } from "bun:test";
import type { BotReturnTrigger, ConversationHandoffReason } from "@/modules/conversations";
import {
  handoffDividerLabel,
  placeHandoffs,
  type ThreadHandoff,
} from "@/modules/conversations/hooks";

const message = (id: string, sentAt: string) => ({ id, sentAt: new Date(sentAt) });

const handoff = (
  id: string,
  occurredAt: string,
  reason: ConversationHandoffReason = "contact_request",
  memberName: string | null = null,
): ThreadHandoff => ({
  kind: "handoff",
  id,
  reason,
  memberName,
  occurredAt: new Date(occurredAt),
});

const botReturn = (
  id: string,
  occurredAt: string,
  trigger: BotReturnTrigger,
  memberName: string | null = null,
): ThreadHandoff => ({ kind: "return", id, trigger, memberName, occurredAt: new Date(occurredAt) });

const placement = (placed: Map<string, ThreadHandoff[]>) =>
  Object.fromEntries([...placed].map(([id, handoffs]) => [id, handoffs.map(({ id }) => id)]));

describe("Handoff dividers in the thread", () => {
  test("each follows the latest message sent before it", () => {
    const messages = [
      message("question", "2026-10-20T09:00:00Z"),
      message("bot-reply", "2026-10-20T09:00:05Z"),
      message("member-reply", "2026-10-20T09:20:00Z"),
    ];

    expect(
      placement(
        placeHandoffs(messages, [
          handoff("by-bot", "2026-10-20T09:00:05Z"),
          handoff("claim", "2026-10-20T09:10:00Z", "claimed"),
        ]),
      ),
    ).toEqual({ "bot-reply": ["by-bot", "claim"] });
  });

  test("follows the reply that caused it even when the database's clock runs a little behind", () => {
    const messages = [
      message("question", "2026-10-20T09:00:00Z"),
      message("member-reply", "2026-10-20T09:05:00.900Z"),
    ];

    expect(
      placement(
        placeHandoffs(messages, [handoff("reply", "2026-10-20T09:05:00Z", "dashboard_reply")]),
      ),
    ).toEqual({ "member-reply": ["reply"] });
  });

  test("one older than every loaded message waits for older messages", () => {
    const messages = [message("latest", "2026-10-20T12:00:00Z")];

    expect(placement(placeHandoffs(messages, [handoff("early", "2026-10-20T09:00:00Z")]))).toEqual(
      {},
    );
  });

  test("says who took the Conversation, or why the Bot passed it on", () => {
    const at = "2026-10-20T09:00:00Z";
    expect(handoffDividerLabel(handoff("1", at, "claimed", "Juliana Prado"))).toBe(
      "Juliana Prado assumiu a conversa",
    );
    expect(handoffDividerLabel(handoff("2", at, "dashboard_reply"))).toBe(
      "Um membro respondeu e assumiu a conversa",
    );
    expect(handoffDividerLabel(handoff("3", at, "app_reply"))).toBe(
      "A equipe respondeu pelo app e assumiu a conversa",
    );
    expect(handoffDividerLabel(handoff("4", at, "no_answer"))).toBe(
      "Passou para a equipe: O Bot não soube responder",
    );
  });

  test("a return to the Bot follows the latest message before it, beside the Handoffs", () => {
    const messages = [
      message("bot-reply", "2026-10-20T09:00:00Z"),
      message("contact", "2026-10-21T10:00:00Z"),
    ];

    expect(
      placement(
        placeHandoffs(messages, [
          handoff("claim", "2026-10-20T09:01:00Z", "claimed"),
          botReturn("quiet", "2026-10-21T09:05:00Z", "quiet"),
        ]),
      ),
    ).toEqual({ "bot-reply": ["claim", "quiet"] });
  });

  test("says who returned the Conversation to the Bot, or why it went back on its own", () => {
    const at = "2026-10-20T09:00:00Z";
    expect(handoffDividerLabel(botReturn("1", at, "returned", "Juliana Prado"))).toBe(
      "Juliana Prado devolveu a conversa ao Bot",
    );
    expect(handoffDividerLabel(botReturn("2", at, "resolved"))).toBe(
      "Um membro marcou como resolvida",
    );
    expect(handoffDividerLabel(botReturn("3", at, "contact_message"))).toBe(
      "Voltou para o Bot: o contato escreveu de novo",
    );
    expect(handoffDividerLabel(botReturn("4", at, "quiet"))).toBe(
      "Voltou para o Bot: 24 horas sem mensagens",
    );
  });
});
