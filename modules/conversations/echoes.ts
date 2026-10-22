import { and, eq, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";

// A text a Member sent from the WhatsApp Business app or a companion
// device, which coexistence echoes to the platform.
export type MessageEcho = {
  wamid: string;
  // The Contact's wa_id.
  to: string;
  text: string;
  sentAt: Date;
  receivedAt?: Date;
};

// What an echo was: a Member's reply from the app, or the echo of a message
// the platform sent itself. Only an app reply is Members' activity, which
// Handoff relies on; ownership is never inferred any other way.
export type EchoClassification = {
  echo: "app_reply" | "own_echo";
  conversationId: string;
};

// Serialises filing an echo with storing the wamid of the send it may echo,
// until the transaction ends.
const lockWamid = (tx: Transaction, tenantId: string, wamid: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${wamid}`}, 0))`);

// Gives the Tenant's sent message the wamid Meta answered with. Its echo may
// have been filed as an app reply before that answer; it was this message all
// along, so the echo's row gives way and its delivery status carries over.
export const recordSentWamid = (db: Database, tenantId: string, messageId: string, wamid: string) =>
  db.transaction(async (tx) => {
    await lockWamid(tx, tenantId, wamid);
    const [echoed] = await tx
      .delete(message)
      .where(
        and(eq(message.tenantId, tenantId), eq(message.wamid, wamid), eq(message.origin, "app")),
      )
      .returning({ status: message.status });
    await tx
      .update(message)
      .set(echoed?.status ? { wamid, status: echoed.status } : { wamid })
      .where(and(eq(message.id, messageId), eq(message.tenantId, tenantId)));
  });

export const recordBotReplySent = (
  db: Database,
  route: ChannelRoute,
  messageId: string,
  wamid: string,
) => recordSentWamid(db, route.tenantId, messageId, wamid);

const classify = (stored: { origin: string; conversationId: string }): EchoClassification => ({
  echo: stored.origin === "app" ? "app_reply" : "own_echo",
  conversationId: stored.conversationId,
});

// Files an echo not matched to the platform's own send as a Member's reply
// from the app. An echo of an own send changes nothing. Safe to repeat: a
// repeated echo is classified as it was the first time.
export const recordMessageEcho = (db: Database, route: ChannelRoute, echo: MessageEcho) =>
  db.transaction(async (tx): Promise<EchoClassification | null> => {
    const findStored = async () => {
      const [stored] = await tx
        .select({ origin: message.origin, conversationId: message.conversationId })
        .from(message)
        .where(and(eq(message.tenantId, route.tenantId), eq(message.wamid, echo.wamid)));
      return stored;
    };
    await lockWamid(tx, route.tenantId, echo.wamid);
    const stored = await findStored();
    if (stored) return classify(stored);

    return withContactAdmission(
      tx,
      route,
      {
        phone: echo.to,
        receivedAt: echo.receivedAt,
        events: [echo],
        occurredAt: (event) => event.sentAt,
      },
      async ({ tx, fileConversation }) => {
        const conversationId = await fileConversation();
        const [inserted] = await tx
          .insert(message)
          .values({
            tenantId: route.tenantId,
            conversationId,
            wamid: echo.wamid,
            direction: "outbound",
            origin: "app",
            // Echoed means sent; later statuses move it forward.
            status: "sent",
            type: "text",
            text: echo.text,
            sentAt: echo.sentAt,
          })
          .onConflictDoNothing({ target: [message.tenantId, message.wamid] })
          .returning({ origin: message.origin, conversationId: message.conversationId });
        // A concurrent job stored the same wamid first.
        return classify(inserted ?? (await findStored()));
      },
    );
  });
