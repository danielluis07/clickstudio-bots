type MessageAuthor = { origin: "contact" | "dashboard"; authorName: string | null };

// Who wrote a reply, shown above it. A removed Member's replies stay readable
// without naming them. Null for the Contact's own messages.
export const messageAuthorLabel = (message: MessageAuthor) =>
  message.origin === "dashboard" ? message.authorName ?? "Membro removido" : null;

export const messageStatusLabels = {
  pending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Não enviada",
} as const;
