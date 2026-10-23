import type { Database } from "@/db/database";
import { message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";
import { handOff } from "@/modules/conversations/handoff";

export type InboundTextMessage = {
  wamid: string;
  from: string;
  profileName: string | null;
  text: string;
  sentAt: Date;
  receivedAt?: Date;
};

export type InboundMessage = Omit<InboundTextMessage, "text"> & {
  type: (typeof message.$inferSelect)["type"];
  text: string | null;
};

// Files a Contact's message under the Channel's Tenant. Safe to repeat: the
// Contact, Conversation and message are each unique, so a redelivered or
// concurrently processed event changes nothing.
export const recordInboundMessage = (db: Database, route: ChannelRoute, inbound: InboundMessage) =>
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
      const inserted = await tx
        .insert(message)
        .values({
          tenantId: route.tenantId,
          conversationId,
          wamid: inbound.wamid,
          direction: "inbound",
          origin: "contact",
          type: inbound.type,
          text: inbound.text,
          sentAt: inbound.sentAt,
        })
        .onConflictDoNothing({ target: [message.tenantId, message.wamid] })
        .returning({ id: message.id });
      // New unsupported content must reach the team even while the Bot is
      // paused or inactive. A duplicate must not undo a Member's resumption.
      if (
        inserted.length &&
        inbound.type !== "text" &&
        (inbound.type === "audio" || !inbound.text?.trim())
      )
        await handOff(tx, route, conversationId, "sem_resposta");
      return conversationId;
    },
  );

export const recordInboundTextMessage = (
  db: Database,
  route: ChannelRoute,
  inbound: InboundTextMessage,
) => recordInboundMessage(db, route, { ...inbound, type: "text" });
