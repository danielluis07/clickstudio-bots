import type { Database } from "@/db/database";
import { message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";

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
export const recordImportedHistory = (
  db: Database,
  route: ChannelRoute,
  history: ImportedHistory,
) =>
  withContactAdmission(
    db,
    route,
    {
      phone: history.phone,
      receivedAt: history.receivedAt,
      events: history.messages,
      occurredAt: (event) => event.sentAt,
    },
    async ({ tx, events: messages, fileConversation }) => {
      const conversationId = await fileConversation();
      await tx
        .insert(message)
        .values(
          messages.map((imported) => ({
            tenantId: route.tenantId,
            conversationId,
            wamid: imported.wamid,
            direction: imported.direction,
            // The business wrote in the app before the platform was connected.
            origin: imported.direction === "inbound" ? ("contact" as const) : ("app" as const),
            status: imported.status,
            type: "text" as const,
            text: imported.text,
            sentAt: imported.sentAt,
            imported: true,
          })),
        )
        .onConflictDoNothing({ target: [message.tenantId, message.wamid] });
      return conversationId;
    },
  );
