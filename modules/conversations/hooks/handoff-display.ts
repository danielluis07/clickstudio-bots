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

// The Bot is working on a reply to the Contact's latest messages (#229). Not
// "respondendo", which says the Bot is in charge of the Conversation.
export const botReplyingLabel = "Bot digitando…";

// On the waiting list: a Handoff no Member has marked "Resolvida" yet.
export const openConversationLabel = "Em aberto";

// Who answers now and, for the team, why: the list's owner icon names it.
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
  { value: "abertas", label: openConversationLabel },
] as const;

// "aguardando" was the filter's value before it was renamed; old links keep working.
export const isWaitingFilter = (filter: string) => filter === "abertas" || filter === "aguardando";
