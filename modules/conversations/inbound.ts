import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { conversation, message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";
import { raiseAlerts } from "@/modules/conversations/alerts";
import { handOff, resumeOnContactMessage } from "@/modules/conversations/handoff";
import type { AlertPing } from "@/platform/notifier";

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
// concurrently processed event changes nothing. A new message in a
// Conversation the team owns raises a Team message Alert, and one the Bot
// hands off raises a Handoff Alert; both are added to `alerts` once the
// transaction has committed, for the caller to announce.
export const recordInboundMessage = async (
  db: Database,
  route: ChannelRoute,
  inbound: InboundMessage,
  alerts?: AlertPing[],
) => {
  const raised: AlertPing[] = [];
  const conversationId = await withContactAdmission(
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
      if (!inserted.length) return conversationId;
      // A duplicate must not return a Conversation a Member since acted on.
      await resumeOnContactMessage(tx, route, conversationId);
      // The upsert above holds the Conversation row, so its owner cannot change.
      const [{ owner }] = await tx
        .select({ owner: conversation.owner })
        .from(conversation)
        .where(and(eq(conversation.id, conversationId), eq(conversation.tenantId, route.tenantId)));
      if (owner === "team") {
        const key = `message:${inbound.wamid}`;
        raised.push(...(await raiseAlerts(tx, route, conversationId, "team_message", key)));
      }
      // New unsupported content must reach the team even while the Bot is
      // paused or inactive. A duplicate must not undo a Member's resumption.
      if (inbound.type !== "text" && (inbound.type === "audio" || !inbound.text?.trim()))
        await handOff(tx, route, conversationId, "no_answer", { alerts: raised });
      return conversationId;
    },
  );
  alerts?.push(...raised);
  return conversationId;
};

export const recordInboundTextMessage = (
  db: Database,
  route: ChannelRoute,
  inbound: InboundTextMessage,
) => recordInboundMessage(db, route, { ...inbound, type: "text" });
