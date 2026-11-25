import type { ConversationHandoffReason } from "@/modules/conversations/handoff";

// Why the latest Handoff happened, as Members read it.
export const handoffReasonLabels: Record<ConversationHandoffReason, string> = {
  no_answer: "O Bot não soube responder",
  contact_request: "O contato pediu atendimento",
  handoff_topic: "Regra do negócio",
  bot_unavailable: "Bot indisponível",
  allowance_exhausted: "Limite de respostas atingido",
  contact_cap_reached: "Limite diário do contato atingido",
  claimed: "Assumida por um membro",
  dashboard_reply: "Membro respondeu pelo painel",
  app_reply: "Membro respondeu pelo app",
};

export const conversationAnswererLabels = {
  bot: "Bot respondendo",
  team: "Equipe atendendo",
} as const;

// Under the Contact's name: who answers now and, for the team, why.
export const conversationStatusLine = (conversation: {
  owner: keyof typeof conversationAnswererLabels;
  handoffReason: ConversationHandoffReason | null;
}) =>
  (conversation.owner === "team" &&
    conversation.handoffReason &&
    handoffReasonLabels[conversation.handoffReason]) ||
  conversationAnswererLabels[conversation.owner];

// The inbox's list filters, as kept in the URL.
export const conversationFilters = [
  { value: "", label: "Todas" },
  { value: "aguardando", label: "Aguardando equipe" },
] as const;

export const isWaitingFilter = (filter: string) => filter === "aguardando";
