import type { AlertKind } from "@/modules/conversations/alerts";

// What happened, with how many events the Alert merged.
export const alertKindLabel = ({ kind, count }: { kind: AlertKind; count: number }) => {
  if (kind === "handoff")
    return count > 1 ? `${count} Handoffs para a equipe` : "Handoff para a equipe";
  if (kind === "team_message")
    return count > 1 ? `${count} novas mensagens na equipe` : "Nova mensagem na equipe";
  return count > 1 ? `${count} novas mensagens` : "Nova mensagem";
};

// The bell's count, kept short.
export const alertCountLabel = (unread: number) => (unread > 99 ? "99+" : String(unread));

// The bell's accessible name, with the unread count.
export const alertBellLabel = (unread: number) =>
  unread > 0 ? `Alertas, ${unread} ${unread === 1 ? "não lido" : "não lidos"}` : "Alertas";

export const alertChannelLabels = { whatsapp: "WhatsApp" } as const;

// The switches of the Notificações settings, in order.
export const alertPreferenceOptions = [
  {
    key: "handoff",
    label: "Handoff para a equipe",
    description: "Quando o Bot passa uma conversa para a equipe.",
  },
  {
    key: "teamMessage",
    label: "Mensagens em conversas da equipe",
    description: "Quando um contato escreve numa conversa que a equipe assumiu.",
  },
  {
    key: "anyMessage",
    label: "Qualquer mensagem",
    description: "Quando um contato escreve em qualquer conversa, inclusive as do Bot.",
  },
  {
    key: "sound",
    label: "Tocar som",
    description: "Um som curto a cada novo alerta.",
  },
  {
    key: "browserNotification",
    label: "Notificação do navegador",
    description: "Avisa quando o painel está aberto em segundo plano.",
  },
] as const;
