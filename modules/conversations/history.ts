import type { Database } from "@/db/database";
import { message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { fileConversation } from "@/modules/conversations/inbound";
import { lockContact, predatesDeletion } from "@/modules/conversations/contact-deletion";

// One Contact's messages from the WhatsApp Business app's history. Meta
// shares it after onboarding in phased chunks that may arrive in any order,
// each holding several Contacts' messages.
export type ImportedHistory = {
  // The Contact's wa_id.
  phone: string;
  receivedAt?: Date;
  messages: {
    wamid: string;
    direction: "inbound" | "outbound";
    // Never pending: the platform is not sending it.
    status: Exclude<typeof message.$inferSelect.status, "pending">;
    text: string;
    sentAt: Date;
  }[];
};

// Files the messages as imported in the Contact's Conversation.
// They are history, so they start no Bot turn and no Handoff. Safe to repeat
// in any order: each message is unique, and one already received live keeps
// its live record. Null when there is nothing to show.
export const recordImportedHistory = (db: Database, route: ChannelRoute, history: ImportedHistory) =>
  db.transaction(async (tx) => {
    const deletedAt = await lockContact(tx, route.tenantId, history.phone);
    const messages = history.messages.filter(({ sentAt }) => !predatesDeletion(deletedAt, sentAt, history.receivedAt));
    if (messages.length === 0) return null;
    const latest = new Date(Math.max(...messages.map(({ sentAt }) => sentAt.getTime())));
    const conversationId = await fileConversation(tx, route, {
      phone: history.phone, profileName: null, sentAt: latest, receivedAt: history.receivedAt,
    });
    if (!conversationId) return null;
    await tx.insert(message).values(messages.map((imported) => ({
      tenantId: route.tenantId,
      conversationId,
      wamid: imported.wamid,
      direction: imported.direction,
      // The business wrote in the app before the platform was connected.
      origin: imported.direction === "inbound" ? "contact" as const : "app" as const,
      status: imported.status,
      type: "text" as const,
      text: imported.text,
      sentAt: imported.sentAt,
      imported: true,
    }))).onConflictDoNothing({ target: [message.tenantId, message.wamid] });
    return conversationId;
  });
