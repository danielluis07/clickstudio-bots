import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db/database";
import { message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { findMessageConversation } from "@/modules/conversations/message-conversation";

export type MessageStatusUpdate = {
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed";
};

// Meta may deliver statuses out of order, so a message's status only moves
// forward along this progression.
const progression = message.status.enumValues;

const rankOf = (status: SQL | typeof message.status) =>
  sql`array_position(array[${sql.join(progression.map((step) => sql`${step}`), sql`, `)}]::text[], ${status})`;

// Reflects Meta's delivery status on the Channel's outbound message. Creates
// nothing: a status for a message the Tenant never stored changes nothing.
export const recordMessageStatus = async (db: Database, route: ChannelRoute, update: MessageStatusUpdate) => {
  await db.update(message)
    .set({ status: update.status })
    .where(and(
      eq(message.tenantId, route.tenantId),
      eq(message.wamid, update.wamid),
      eq(message.direction, "outbound"),
      sql`${rankOf(message.status)} < ${rankOf(sql`${update.status}::text`)}`,
    ));
  // Look up even on a retry that already applied the status: a failed ping
  // must still be deliverable after the database write committed.
  return findMessageConversation(db, route, update.wamid, "outbound");
};
