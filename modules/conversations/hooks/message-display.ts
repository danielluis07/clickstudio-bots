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

// Which of the thread's three voices wrote a message: each has its own colour.
// A reply from the WhatsApp Business app is the team's, like one from here.
export const messageAuthorKind = ({ origin }: Pick<MessageAuthor, "origin">) =>
  origin === "contact" ? "contact" : origin === "bot" ? "bot" : "team";

export type MessageAuthorKind = ReturnType<typeof messageAuthorKind>;

export type MessageType = InboundMessage["type"];

// What a message shows in place of text it does not have.
const mediaLabels: Record<Exclude<MessageType, "text">, string> = {
  audio: "Áudio",
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  unsupported: "Mídia não suportada",
};

export const mediaLabel = (type: Exclude<MessageType, "text">) => mediaLabels[type];

// A message in one short line, for the bell and the Conversation list: its
// text or caption, else its media kind; null when there is nothing to show.
export const messagePreviewText = (
  preview: { type: MessageType; text: string | null; revoked: boolean } | null,
) => {
  if (!preview) return null;
  if (preview.revoked) return "Mensagem apagada";
  if (preview.text) return preview.text;
  return preview.type === "text" ? null : mediaLabels[preview.type];
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

// Meta's error codes for an undelivered message that a Member can act on.
const failureReasons: Record<number, string> = {
  131000: "Erro desconhecido no WhatsApp",
  131021: "O contato é o próprio número da empresa",
  131026: "O número não pode receber a mensagem",
  131031: "A conta do WhatsApp está bloqueada",
  131042: "Problema de pagamento na conta do WhatsApp",
  131047: "Mais de 24 horas desde a última mensagem do contato",
  131048: "Limite de envio atingido por denúncias de spam",
  131056: "Muitas mensagens para este contato em pouco tempo",
};

// Why Meta did not deliver a message, or null when it gave no code.
export const messageFailureReason = (failureCode: number | null) =>
  failureCode === null
    ? null
    : `${failureReasons[failureCode] ?? "Erro do WhatsApp"} (código ${failureCode})`;
