import { and, eq } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { conversation, message } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";
import { notifyInbox, type Notifier } from "@/platform/notifier";

export type ConversationHandoffReason = NonNullable<
  (typeof conversation.$inferSelect)["handoffReason"]
>;

// What every Handoff writes. It joins the waiting list, which only
// "Resolvida" leaves.
export const handoffFields = (reason: ConversationHandoffReason) => ({
  owner: "team" as const,
  handoffReason: reason,
  waiting: true,
});

const owns = (scope: { tenantId: string }, conversationId: string) =>
  and(eq(conversation.id, conversationId), eq(conversation.tenantId, scope.tenantId));

// Hands a Bot-owned Conversation to the team. One already with the team keeps
// the reason of the Handoff that put it there. True when it changed hands.
export const handOffFromBot = async (
  db: Database | Transaction,
  scope: { tenantId: string },
  conversationId: string,
  reason: ConversationHandoffReason,
) => {
  const changed = await db
    .update(conversation)
    .set(handoffFields(reason))
    .where(and(owns(scope, conversationId), eq(conversation.owner, "bot")))
    .returning({ id: conversation.id });
  return changed.length > 0;
};

// Gives a Conversation back to the Bot. Contact messages sent during the
// Handoff count as handled, so the Bot answers only from the next one on: a
// Member may already have answered them in the WhatsApp Business app.
const resume = (db: Database, scope: TenantScope, conversationId: string, resolved: boolean) =>
  db.transaction(async (tx) => {
    const [found] = await tx
      .select({ owner: conversation.owner })
      .from(conversation)
      .where(owns(scope, conversationId))
      .for("update");
    if (!found) return false;
    // A Bot-owned Conversation has no backlog: its unanswered messages are
    // the Bot's current turn.
    if (found.owner === "team") {
      await tx
        .update(message)
        .set({ botAnswered: true })
        .where(
          and(
            eq(message.tenantId, scope.tenantId),
            eq(message.conversationId, conversationId),
            eq(message.origin, "contact"),
            eq(message.botAnswered, false),
          ),
        );
    }
    await tx
      .update(conversation)
      .set({ owner: "bot", ...(resolved ? { waiting: false, handoffReason: null } : {}) })
      .where(owns(scope, conversationId));
    return true;
  });

// The Handoff controls any Member may use, whoever took the Conversation over.
// Resuming happens only here, never from the app or after inactivity.
export const createHandoffControls = ({ db, notifier }: { db: Database; notifier: Notifier }) => {
  const outcome = async (scope: TenantScope, conversationId: string, found: boolean) => {
    if (!found) return { ok: false as const, error: "not_found" as const };
    await notifyInbox(notifier, scope.tenantId, { conversationId });
    return { ok: true as const };
  };
  const exists = async (scope: TenantScope, conversationId: string) =>
    (await db.select({ id: conversation.id }).from(conversation).where(owns(scope, conversationId)))
      .length > 0;

  return {
    // "Assumir": silences the Bot without sending anything.
    async takeOver(scope: TenantScope, conversationId: string) {
      const found =
        (await handOffFromBot(db, scope, conversationId, "assumida")) ||
        (await exists(scope, conversationId));
      return outcome(scope, conversationId, found);
    },
    // "Devolver ao Bot": the Conversation stays on the waiting list.
    async returnToBot(scope: TenantScope, conversationId: string) {
      return outcome(scope, conversationId, await resume(db, scope, conversationId, false));
    },
    // "Resolvida": back to the Bot and off the waiting list.
    async resolve(scope: TenantScope, conversationId: string) {
      return outcome(scope, conversationId, await resume(db, scope, conversationId, true));
    },
  };
};

export type HandoffControls = ReturnType<typeof createHandoffControls>;
