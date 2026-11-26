import type { BotReturnTrigger, ConversationHandoffReason } from "@/modules/conversations/handoff";
import { handoffReasonLabels } from "@/modules/conversations/hooks/handoff-display";

// One change of hands in the thread: to the team (a Handoff) or back to the
// Bot (a return).
export type ThreadHandoff =
  | {
      kind: "handoff";
      id: string;
      reason: ConversationHandoffReason;
      memberName: string | null;
      occurredAt: Date;
    }
  | {
      kind: "return";
      id: string;
      trigger: BotReturnTrigger;
      memberName: string | null;
      occurredAt: Date;
    };

// A Handoff is recorded by the database in the same transaction as the reply
// that caused it, whose time comes from the app's clock. Allow for the two
// clocks disagreeing by a little, so the divider still follows that reply.
const clockTolerance = 2_000;

// Each divider goes after the latest loaded message sent before its change of
// hands, so it follows the reply or message that caused it. One older than
// every loaded message waits until "Carregar anteriores" brings that message in.
export const placeHandoffs = <M extends { id: string; sentAt: Date }>(
  messages: M[],
  handoffs: ThreadHandoff[],
) => {
  const after = new Map<string, ThreadHandoff[]>();
  for (const handoff of handoffs) {
    const at = handoff.occurredAt.getTime() + clockTolerance;
    const anchor = messages.findLast(({ sentAt }) => sentAt.getTime() <= at);
    if (!anchor) continue;
    after.set(anchor.id, [...(after.get(anchor.id) ?? []), handoff]);
  }
  return after;
};

// What the divider says, as Members read it.
export const handoffDividerLabel = (handoff: ThreadHandoff) => {
  const member = handoff.memberName ?? "Um membro";
  if (handoff.kind === "return") {
    if (handoff.trigger === "returned") return `${member} devolveu a conversa ao Bot`;
    if (handoff.trigger === "resolved") return `${member} marcou como resolvida`;
    if (handoff.trigger === "contact_message")
      return "Voltou para o Bot: o contato escreveu de novo";
    return "Voltou para o Bot: 24 horas sem mensagens";
  }
  if (handoff.reason === "claimed") return `${member} assumiu a conversa`;
  if (handoff.reason === "dashboard_reply") return `${member} respondeu e assumiu a conversa`;
  if (handoff.reason === "app_reply") return "A equipe respondeu pelo app e assumiu a conversa";
  return `Passou para a equipe: ${handoffReasonLabels[handoff.reason]}`;
};
