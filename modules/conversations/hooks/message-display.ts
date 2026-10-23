import type { InboundMessage } from "@/modules/conversations/inbound";

type MessageAuthor = { origin: "contact" | "dashboard" | "app" | "bot"; authorName: string | null };

// Who wrote a reply, shown above it. A removed Member's replies stay readable
// without naming them. The app's echo does not say which Member replied. Null
// for the Contact's own messages.
export const messageAuthorLabel = (message: MessageAuthor) => {
  if (message.origin === "bot") return "Bot";
  if (message.origin === "dashboard") return message.authorName ?? "Membro removido";
  if (message.origin === "app") return "Equipe (app WhatsApp)";
  return null;
};

// What a message shows in place of text it does not have.
const mediaLabels: Record<Exclude<InboundMessage["type"], "text">, string> = {
  audio: "Áudio",
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  unsupported: "Mídia não suportada",
};

export const messagePlaceholder = (message: {
  revokedAt: Date | null;
  type?: InboundMessage["type"];
}) => {
  if (message.revokedAt) return "Mensagem apagada";
  return message.type && message.type !== "text"
    ? `${mediaLabels[message.type]}. Abra no WhatsApp.`
    : "Mensagem sem texto";
};

export const messageDisplayText = (message: {
  type: InboundMessage["type"];
  text: string | null;
  revokedAt: Date | null;
}) => {
  if (message.revokedAt) return messagePlaceholder(message);
  if (message.type !== "text")
    return [messagePlaceholder(message), message.text].filter(Boolean).join("\n\n");
  return message.text ?? messagePlaceholder(message);
};

// Marks an edited message; a revoked one shows nothing to edit.
export const messageEditedLabel = (message: { editedAt: Date | null; revokedAt: Date | null }) =>
  message.editedAt && !message.revokedAt ? "Editada" : null;

export const messageStatusLabels = {
  pending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Não enviada",
} as const;
