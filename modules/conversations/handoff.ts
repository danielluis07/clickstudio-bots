import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { conversation, message } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";
import { notifyInbox, type Notifier } from "@/platform/notifier";

export type ConversationHandoffReason = NonNullable<
  (typeof conversation.$inferSelect)["handoffReason"]
>;

const owns = (scope: { tenantId: string }, conversationId: string) =>
  and(eq(conversation.id, conversationId), eq(conversation.tenantId, scope.tenantId));

// The Contact messages the Bot has yet to answer: a live turn answers them,
// and resuming after a Handoff settles them.
export const unansweredContactMessages = (
  scope: { tenantId: string },
  conversationIds: string | string[],
) =>
  and(
    eq(message.tenantId, scope.tenantId),
    typeof conversationIds === "string"
      ? eq(message.conversationId, conversationIds)
      : inArray(message.conversationId, conversationIds),
    eq(message.origin, "contact"),
    eq(message.imported, false),
    eq(message.botAnswered, false),
  );

// The only write of a Handoff. It hands a Bot-owned Conversation to the team
// and puts it on the waiting list, which only "Resolvida" leaves. One already
// with the team keeps the reason of the Handoff that put it there. With
// `leaseToken`, only the live turn holding that lease may hand off. True when
// it changed hands. Inside a transaction, the caller notifies the inbox after
// it commits.
export const handOff = async (
  db: Database | Transaction,
  scope: { tenantId: string },
  conversationId: string,
  reason: ConversationHandoffReason,
  { leaseToken }: { leaseToken?: string } = {},
) => {
  const changed = await db
    .update(conversation)
    .set({ owner: "team", handoffReason: reason, waiting: true })
    .where(
      and(
        owns(scope, conversationId),
        eq(conversation.owner, "bot"),
        leaseToken ? eq(conversation.botLeaseToken, leaseToken) : undefined,
      ),
    )
    .returning({ id: conversation.id });
  return changed.length > 0;
};

// A Handoff outside a transaction, published to the inbox once it is written.
export const handOffAndNotify = async (
  db: Database,
  notifier: Notifier,
  scope: { tenantId: string },
  conversationId: string,
  reason: ConversationHandoffReason,
  options: { leaseToken?: string } = {},
) => {
  const changed = await handOff(db, scope, conversationId, reason, options);
  if (changed) await notifyInbox(notifier, scope.tenantId, { conversationId });
  return changed;
};

// Gives a Conversation back to the Bot. Contact messages sent during the
// Handoff count as handled, so the Bot answers only from the next one on: a
// Member may already have answered them in the WhatsApp Business app.
const resume = async (
  db: Database,
  scope: TenantScope,
  conversationIds: string[],
  resolved: boolean,
) => {
  const ids = [...new Set(conversationIds)];
  if (ids.length === 0) return false;
  return db.transaction(async (tx) => {
    const selected = and(eq(conversation.tenantId, scope.tenantId), inArray(conversation.id, ids));
    const found = await tx
      .select({ id: conversation.id, owner: conversation.owner })
      .from(conversation)
      .where(selected)
      .orderBy(asc(conversation.id))
      .for("update");
    // Refuse the whole selection before writing if any Conversation is missing
    // or belongs to another Tenant. Stable lock order also avoids bulk deadlocks.
    if (found.length !== ids.length) return false;
    // A Bot-owned Conversation has no backlog: its unanswered messages are
    // the Bot's current turn.
    const handoffs = found.filter(({ owner }) => owner === "team").map(({ id }) => id);
    if (handoffs.length > 0) {
      await tx
        .update(message)
        .set({ botAnswered: true })
        .where(unansweredContactMessages(scope, handoffs));
    }
    await tx
      .update(conversation)
      .set({ owner: "bot", ...(resolved ? { waiting: false, handoffReason: null } : {}) })
      .where(selected);
    return true;
  });
};

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
        (await handOff(db, scope, conversationId, "assumida")) ||
        (await exists(scope, conversationId));
      return outcome(scope, conversationId, found);
    },
    // "Devolver ao Bot": the Conversation stays on the waiting list.
    async returnToBot(scope: TenantScope, conversationId: string) {
      return outcome(scope, conversationId, await resume(db, scope, [conversationId], false));
    },
    async bulkReturnToBot(scope: TenantScope, conversationIds: string[]) {
      const ids = [...new Set(conversationIds)];
      if (!(await resume(db, scope, ids, false)))
        return { ok: false as const, error: "not_found" as const };
      await Promise.all(
        ids.map((conversationId) => notifyInbox(notifier, scope.tenantId, { conversationId })),
      );
      return { ok: true as const };
    },
    // "Resolvida": back to the Bot and off the waiting list.
    async resolve(scope: TenantScope, conversationId: string) {
      return outcome(scope, conversationId, await resume(db, scope, [conversationId], true));
    },
  };
};

export type HandoffControls = ReturnType<typeof createHandoffControls>;
