import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { conversation, message } from "@/db/schema";
import type { ChannelRoute } from "@/modules/channels";
import type { TenantScope } from "@/modules/tenancy";
import { withContactAdmission } from "@/modules/conversations/contact-deletion";
import { handOff } from "@/modules/conversations/handoff";

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

// Serialises a Conversation's echo filing with its Bot reply's outcome.
const lockConversation = (tx: Transaction, tenantId: string, conversationId: string) =>
  tx
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.id, conversationId), eq(conversation.tenantId, tenantId)))
    .for("update");

// Settles the app echoes filed while the Bot's reply awaited its wamid. Those
// still standing once the reply has its wamid were a Member's app replies.
export const resolveUnresolvedEchoes = async (
  tx: Transaction,
  tenantId: string,
  conversationId: string,
  { handOff: handsOff }: { handOff: boolean },
) => {
  const resolved = await tx
    .update(message)
    .set({ echoUnresolved: false })
    .where(
      and(
        eq(message.tenantId, tenantId),
        eq(message.conversationId, conversationId),
        eq(message.echoUnresolved, true),
      ),
    )
    .returning({ id: message.id });
  if (handsOff && resolved.length)
    await handOff(tx, { tenantId }, conversationId, "resposta_no_app");
};

// Gives the Tenant's sent message the wamid Meta answered with. Its echo may
// have been filed as an app reply before that answer; it was this message all
// along, so the echo's row gives way and its delivery status carries over.
// Returns whether this is a newly acknowledged production Bot reply. The caller
// records its usage in this same transaction, so neither write can commit alone.
export const recordSentWamid = async (
  tx: Transaction,
  scope: ChannelRoute | TenantScope,
  messageId: string,
  wamid: string,
) => {
  const { tenantId } = scope;
  await lockWamid(tx, tenantId, wamid);
  const [sent] = await tx
    .select({ origin: message.origin, conversationId: message.conversationId })
    .from(message)
    .where(and(eq(message.id, messageId), eq(message.tenantId, tenantId)));
  if (sent) await lockConversation(tx, tenantId, sent.conversationId);
  const [echoed] = await tx
    .delete(message)
    .where(and(eq(message.tenantId, tenantId), eq(message.wamid, wamid), eq(message.origin, "app")))
    .returning({ status: message.status });
  const acknowledged = await tx
    .update(message)
    .set({
      wamid,
      status:
        echoed?.status ??
        sql`case when ${message.origin} = 'bot' then 'sent' else ${message.status} end`,
    })
    .where(and(eq(message.id, messageId), eq(message.tenantId, tenantId), isNull(message.wamid)))
    .returning({
      origin: message.origin,
      direction: message.direction,
      imported: message.imported,
      type: message.type,
    });
  const reply = acknowledged[0];
  if (sent?.origin === "bot")
    await resolveUnresolvedEchoes(tx, tenantId, sent.conversationId, { handOff: true });
  return (
    reply?.origin === "bot" &&
    reply.direction === "outbound" &&
    reply.type === "text" &&
    !reply.imported
  );
};

const classify = (stored: { origin: string; conversationId: string }): EchoClassification => ({
  echo: stored.origin === "app" ? "app_reply" : "own_echo",
  conversationId: stored.conversationId,
});

// Files an echo not matched to the platform's own send as a Member's reply
// from the app, which silences the Bot. An echo of an own send changes
// nothing. Safe to repeat: a repeated echo is classified as it was the first
// time, and only the first filing hands off.
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
        await lockConversation(tx, route.tenantId, conversationId);
        // While the Bot's reply awaits its wamid, this may be that reply's echo.
        const [botSending] = await tx
          .select({ id: message.id })
          .from(message)
          .where(
            and(
              eq(message.tenantId, route.tenantId),
              eq(message.conversationId, conversationId),
              eq(message.origin, "bot"),
              eq(message.status, "pending"),
              isNull(message.wamid),
            ),
          )
          .limit(1);
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
            echoUnresolved: Boolean(botSending),
          })
          .onConflictDoNothing({ target: [message.tenantId, message.wamid] })
          .returning({ origin: message.origin, conversationId: message.conversationId });
        if (inserted && !botSending) await handOff(tx, route, conversationId, "resposta_no_app");
        // A concurrent job stored the same wamid first.
        return classify(inserted ?? (await findStored()));
      },
    );
  });
