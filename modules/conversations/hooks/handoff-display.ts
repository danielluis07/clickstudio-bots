import type { ConversationHandoffReason } from "@/modules/conversations/handoff";

export const conversationOwnerLabels = { bot: "Bot", team: "Equipe" } as const;

// Why the latest Handoff happened, as Members read it.
export const handoffReasonLabels: Record<ConversationHandoffReason, string> = {
  sem_resposta: "O Bot não soube responder",
  pedido_do_contato: "O contato pediu atendimento",
  regra_do_negocio: "Regra do negócio",
  bot_indisponivel: "Bot indisponível",
  limite_atingido: "Limite de respostas atingido",
  assumida: "Assumida por um membro",
  resposta_no_painel: "Membro respondeu pelo painel",
  resposta_no_app: "Membro respondeu pelo app",
};

// The inbox's list filters, as kept in the URL.
export const conversationFilters = [
  { value: "", label: "Todas" },
  { value: "aguardando", label: "Aguardando equipe" },
] as const;

export const isWaitingFilter = (filter: string) => filter === "aguardando";
