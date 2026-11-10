import type { ConversationHandoffReason } from "@/modules/conversations/handoff";

export const conversationOwnerLabels = { bot: "Bot", team: "Equipe" } as const;

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

// The inbox's list filters, as kept in the URL.
export const conversationFilters = [
  { value: "", label: "Todas" },
  { value: "aguardando", label: "Aguardando equipe" },
] as const;

export const isWaitingFilter = (filter: string) => filter === "aguardando";
