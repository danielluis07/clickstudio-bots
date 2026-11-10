import { and, eq, lt, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { earlyMessageStatus, message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { findMessageConversation } from "@/modules/conversations/message-conversation";
import { lockWamid } from "@/modules/conversations/wamid-lock";
import type { Clock } from "@/platform/clock";

export type MessageStatusUpdate = {
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed";
};

// Meta answers a send within seconds, so an early status still unmatched after
// this long is for a message the platform never stores.
const earlyStatusRetentionMs = 24 * 60 * 60 * 1000;

// Meta may deliver statuses out of order, so a message's status only moves
// forward along this progression.
const progression = message.status.enumValues;

const rankOf = (status: SQL | AnyColumn) =>
  sql`array_position(array[${sql.join(
    progression.map((step) => sql`${step}`),
    sql`, `,
  )}]::text[], ${status})`;

const advanceStatus = (
  tx: Transaction,
  tenantId: string,
  wamid: string,
  status: MessageStatusUpdate["status"],
) =>
  tx
    .update(message)
    .set({ status })
    .where(
      and(
        eq(message.tenantId, tenantId),
        eq(message.wamid, wamid),
        eq(message.direction, "outbound"),
        sql`${rankOf(message.status)} < ${rankOf(sql`${status}::text`)}`,
      ),
    );

// Applies the status kept for a wamid that had not been stored when it
// arrived. The caller has just stored the wamid, under its lock.
export const applyEarlyStatus = async (tx: Transaction, tenantId: string, wamid: string) => {
  const [early] = await tx
    .delete(earlyMessageStatus)
    .where(and(eq(earlyMessageStatus.tenantId, tenantId), eq(earlyMessageStatus.wamid, wamid)))
    .returning({ status: earlyMessageStatus.status });
  if (early) await advanceStatus(tx, tenantId, wamid, early.status);
};

// Reflects Meta's delivery status on the Channel's outbound message. Creates
// no message: a status that arrives before its wamid is stored, as when it
// wins the race with the send's own answer, is kept until the wamid is.
export const recordMessageStatus = (
  db: Database,
  route: ChannelRoute,
  update: MessageStatusUpdate & { receivedAt: Date },
) =>
  db.transaction(async (tx) => {
    await lockWamid(tx, route.tenantId, update.wamid);
    const [stored] = await tx
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.tenantId, route.tenantId), eq(message.wamid, update.wamid)));
    if (!stored) {
      await tx
        .insert(earlyMessageStatus)
        .values({
          tenantId: route.tenantId,
          wamid: update.wamid,
          status: update.status,
          receivedAt: update.receivedAt,
        })
        .onConflictDoUpdate({
          target: [earlyMessageStatus.tenantId, earlyMessageStatus.wamid],
          set: { status: update.status },
          setWhere: sql`${rankOf(earlyMessageStatus.status)} < ${rankOf(sql`${update.status}::text`)}`,
        });
      return null;
    }
    await advanceStatus(tx, route.tenantId, update.wamid, update.status);
    // Look up even on a retry that already applied the status: a failed ping
    // must still be deliverable after the database write committed.
    return findMessageConversation(tx, route, update.wamid, "outbound");
  });

// Drops early statuses whose message never got its wamid stored.
export const pruneEarlyMessageStatuses = async (db: Database, clock: Clock) => {
  const pruned = await db
    .delete(earlyMessageStatus)
    .where(
      lt(earlyMessageStatus.receivedAt, new Date(clock.now().getTime() - earlyStatusRetentionMs)),
    )
    .returning({ wamid: earlyMessageStatus.wamid });
  return pruned.length;
};
