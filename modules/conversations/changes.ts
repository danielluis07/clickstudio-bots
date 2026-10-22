import type { Database } from "@/db/database";
import { messageChange } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { findMessageConversation } from "@/modules/conversations/message-conversation";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";

// An edit or revoke of an earlier message. A Contact changes their inbound
// messages; a Member in the WhatsApp Business app changes outbound ones.
export type MessageChange = {
  phone: string;
  wamid: string;
  originalWamid: string;
  direction: "inbound" | "outbound";
  changedAt: Date;
  receivedAt?: Date;
} & ({ kind: "edit"; text: string } | { kind: "revoke" });

// Keeps the change under the Channel's Tenant. It only alters how the original
// is displayed, even before the original arrives, and is never activity in the
// Conversation. Safe to repeat.
export const recordMessageChange = (db: Database, route: ChannelRoute, change: MessageChange) =>
  withContactAdmission(
    db,
    route,
    {
      phone: change.phone,
      receivedAt: change.receivedAt,
      events: [change],
      occurredAt: (event) => event.changedAt,
    },
    async ({ tx, addressHash }) => {
      await tx
        .insert(messageChange)
        .values({
          tenantId: route.tenantId,
          wamid: change.wamid,
          originalWamid: change.originalWamid,
          contactAddressHash: addressHash,
          direction: change.direction,
          kind: change.kind,
          text: change.kind === "edit" ? change.text : null,
          changedAt: change.changedAt,
        })
        .onConflictDoNothing({
          target: [messageChange.tenantId, messageChange.kind, messageChange.wamid],
        });
      return findMessageConversation(tx, route, change.originalWamid, change.direction);
    },
  );
