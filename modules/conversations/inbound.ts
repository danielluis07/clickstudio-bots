import type { Database } from "@/db/database";
import { message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";

export type InboundTextMessage = {
  wamid: string;
  from: string;
  profileName: string | null;
  text: string;
  sentAt: Date;
  receivedAt?: Date;
};

// Files a Contact's message under the Channel's Tenant. Safe to repeat: the
// Contact, Conversation and message are each unique, so a redelivered or
// concurrently processed event changes nothing.
export const recordInboundTextMessage = (
  db: Database,
  route: ChannelRoute,
  inbound: InboundTextMessage,
) =>
  withContactAdmission(
    db,
    route,
    {
      phone: inbound.from,
      receivedAt: inbound.receivedAt,
      events: [inbound],
      occurredAt: (event) => event.sentAt,
    },
    async ({ tx, fileConversation }) => {
      const conversationId = await fileConversation(inbound.profileName);
      await tx
        .insert(message)
        .values({
          tenantId: route.tenantId,
          conversationId,
          wamid: inbound.wamid,
          direction: "inbound",
          origin: "contact",
          type: "text",
          text: inbound.text,
          sentAt: inbound.sentAt,
        })
        .onConflictDoNothing({ target: [message.tenantId, message.wamid] });
      return conversationId;
    },
  );
