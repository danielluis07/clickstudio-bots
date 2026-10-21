type MessageAuthor = { origin: "contact" | "dashboard" | "app"; authorName: string | null };

// Who wrote a reply, shown above it. A removed Member's replies stay readable
// without naming them. The app's echo does not say which Member replied. Null
// for the Contact's own messages.
export const messageAuthorLabel = (message: MessageAuthor) => {
  if (message.origin === "dashboard") return message.authorName ?? "Membro removido";
  if (message.origin === "app") return "Equipe (app WhatsApp)";
  return null;
};

// What a message shows in place of text it does not have.
export const messagePlaceholder = (message: { revokedAt: Date | null }) =>
  message.revokedAt ? "Mensagem apagada" : "Mensagem sem texto";

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
