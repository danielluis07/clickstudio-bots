import type { AlertKind } from "@/modules/conversations/alerts";
import { mediaLabel, type MessageType } from "@/modules/conversations/hooks/message-display";

// What happened, with how many events the Alert merged.
export const alertKindLabel = ({ kind, count }: { kind: AlertKind; count: number }) => {
  if (kind === "handoff")
    return count > 1 ? `${count} Handoffs para a equipe` : "Handoff para a equipe";
  return count > 1 ? `${count} novas mensagens` : "Nova mensagem";
};

// The latest Contact message, short; null when the Contact has not written.
export const alertPreviewText = (
  preview: { type: MessageType; text: string | null; revoked: boolean } | null,
) => {
  if (!preview) return null;
  if (preview.revoked) return "Mensagem apagada";
  if (preview.text) return preview.text;
  return preview.type === "text" ? null : mediaLabel(preview.type);
};

// The bell's count, kept short.
export const alertCountLabel = (unread: number) => (unread > 99 ? "99+" : String(unread));

// The bell's accessible name, with the unread count.
export const alertBellLabel = (unread: number) =>
  unread > 0 ? `Alertas, ${unread} ${unread === 1 ? "não lido" : "não lidos"}` : "Alertas";

export const alertChannelLabels = { whatsapp: "WhatsApp" } as const;
