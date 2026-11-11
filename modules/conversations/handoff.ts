import { and, asc, eq, inArray, lte, or, type SQL } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { conversation, message } from "@/db/schema";
import { serviceWindowHours } from "@/modules/conversations/repository";
import { recordMemberActivity, type TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import { notifyInbox, type Notifier } from "@/platform/notifier";

export type ConversationHandoffReason = NonNullable<
  (typeof conversation.$inferSelect)["handoffReason"]
>;

// Handoffs a Member caused. After any of them a Member is on the Conversation,
// so a "Bot indisponível" Handoff no longer returns on the Contact's next message.
const memberHandoffReasons: readonly ConversationHandoffReason[] = [
  "claimed",
  "dashboard_reply",
  "app_reply",
] as const satisfies readonly ConversationHandoffReason[];

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
// with the team keeps the reason of the Handoff that put it there, but a
// Member Handoff still stops it returning on the Contact's next message. With
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
  const byMember = memberHandoffReasons.includes(reason);
  const changed = await db
    .update(conversation)
    .set({
      owner: "team",
      handoffReason: reason,
      waiting: true,
      resumeOnContactMessage: reason === "bot_unavailable",
      // A Member on the Conversation hears of the next outage again.
      ...(byMember ? { unavailableNoticeSent: false } : {}),
    })
    .where(
      and(
        owns(scope, conversationId),
        eq(conversation.owner, "bot"),
        leaseToken ? eq(conversation.botLeaseToken, leaseToken) : undefined,
      ),
    )
    .returning({ id: conversation.id });
  if (changed.length === 0 && byMember)
    await db
      .update(conversation)
      .set({ resumeOnContactMessage: false, unavailableNoticeSent: false })
      .where(
        and(
          owns(scope, conversationId),
          or(
            eq(conversation.resumeOnContactMessage, true),
            eq(conversation.unavailableNoticeSent, true),
          ),
        ),
      );
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

type Resumption = {
  // "Resolvida": also clears the reason and takes it off the waiting list.
  resolved?: boolean;
  // Leaves the Handoff backlog to the Bot's next turn, for when no Member can
  // have answered it.
  answerBacklog?: boolean;
  // Refuses the whole selection unless every Conversation is found.
  requireAll?: boolean;
  // Returns only the Conversations that still match once locked.
  where?: SQL;
  // When a Member returned it. The daily reply cap per Contact then counts
  // afresh; automatic returns leave the count as it was.
  byMemberAt?: Date;
};

// The only way back to the Bot, for the Member commands and the automatic
// returns alike. Contact messages sent during the Handoff count as handled
// unless `answerBacklog`, so the Bot answers only from the next one on: a
// Member may already have answered them in the WhatsApp Business app. Returns
// the ids it returned, none when `requireAll` refused the selection.
const resume = async (
  tx: Transaction,
  scope: { tenantId: string },
  conversationIds: string[],
  {
    resolved = false,
    answerBacklog = false,
    requireAll = false,
    where,
    byMemberAt,
  }: Resumption = {},
) => {
  const ids = [...new Set(conversationIds)];
  if (ids.length === 0) return [];
  const found = await tx
    .select({ id: conversation.id, owner: conversation.owner })
    .from(conversation)
    .where(and(eq(conversation.tenantId, scope.tenantId), inArray(conversation.id, ids), where))
    .orderBy(asc(conversation.id))
    .for("update");
  // Refuse the whole selection before writing if any Conversation is missing
  // or belongs to another Tenant. Stable lock order also avoids bulk deadlocks.
  if (found.length === 0 || (requireAll && found.length !== ids.length)) return [];
  // A Bot-owned Conversation has no backlog: its unanswered messages are
  // the Bot's current turn.
  const handoffs = found.filter(({ owner }) => owner === "team").map(({ id }) => id);
  if (handoffs.length > 0 && !answerBacklog) {
    await tx
      .update(message)
      .set({ botAnswered: true })
      .where(unansweredContactMessages(scope, handoffs));
  }
  const resumed = found.map(({ id }) => id);
  await tx
    .update(conversation)
    .set({
      owner: "bot",
      resumeOnContactMessage: false,
      // The automatic returns keep it: no Member acted, and no turn succeeded.
      ...(byMemberAt ? { returnedByMemberAt: byMemberAt, unavailableNoticeSent: false } : {}),
      ...(resolved ? { waiting: false, handoffReason: null } : {}),
    })
    .where(and(eq(conversation.tenantId, scope.tenantId), inArray(conversation.id, resumed)));
  return resumed;
};

const resumeFromDashboard = async (
  db: Database,
  scope: TenantScope,
  conversationIds: string[],
  resolved: boolean,
  now: Date,
) =>
  (
    await db.transaction(async (tx) => {
      const resumed = await resume(tx, scope, conversationIds, {
        resolved,
        requireAll: true,
        byMemberAt: now,
      });
      if (resumed.length > 0)
        await recordMemberActivity(tx, scope, {
          action: resolved ? "conversation.resolved" : "conversation.returned_to_bot",
          subjectIds: resumed,
          at: now,
        });
      return resumed;
    })
  ).length > 0;

// A new Contact message returns a "Bot indisponível" Handoff no Member has
// acted on: the provider has likely recovered, and if not, the turn hands off
// again. No Member answered the backlog, so the Bot's turn answers it too. The
// Conversation stays on the waiting list. True when it returned.
export const resumeOnContactMessage = async (
  tx: Transaction,
  scope: { tenantId: string },
  conversationId: string,
) =>
  (
    await resume(tx, scope, [conversationId], {
      answerBacklog: true,
      where: and(eq(conversation.owner, "team"), eq(conversation.resumeOnContactMessage, true)),
    })
  ).length > 0;

// Handoffs returned per sweep, across every Tenant, oldest first.
const quietHandoffBatch = 100;

// Run by the sweep: a Handoff with no message from either side for a whole
// service window returns to the Bot, which answers the Contact's next message.
// The backlog is settled as a Member's return would, and the Conversation stays
// on the waiting list.
export const returnQuietHandoffs = async ({
  db,
  clock,
  notifier,
}: {
  db: Database;
  clock: Clock;
  notifier: Notifier;
}) => {
  const quietSince = new Date(clock.now().getTime() - serviceWindowHours * 60 * 60 * 1000);
  const quiet = and(eq(conversation.owner, "team"), lte(conversation.lastMessageAt, quietSince));
  const candidates = await db
    .select({ id: conversation.id, tenantId: conversation.tenantId })
    .from(conversation)
    .where(quiet)
    .orderBy(asc(conversation.lastMessageAt))
    .limit(quietHandoffBatch);
  const byTenant = Map.groupBy(candidates, ({ tenantId }) => tenantId);
  for (const [tenantId, rows] of byTenant) {
    const ids = rows.map(({ id }) => id);
    const resumed = await db.transaction((tx) => resume(tx, { tenantId }, ids, { where: quiet }));
    for (const conversationId of resumed) await notifyInbox(notifier, tenantId, { conversationId });
  }
};

// The Handoff controls any Member may use, whoever took the Conversation over.
// Besides these, only a Contact's message after a "Bot indisponível" Handoff
// and a quiet service window return a Conversation to the Bot.
export const createHandoffControls = ({
  db,
  clock,
  notifier,
}: {
  db: Database;
  clock: Clock;
  notifier: Notifier;
}) => {
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
      const changed = await db.transaction(async (tx) => {
        if (!(await handOff(tx, scope, conversationId, "claimed"))) return false;
        await recordMemberActivity(tx, scope, {
          action: "conversation.taken_over",
          subjectIds: [conversationId],
          at: clock.now(),
        });
        return true;
      });
      const found = changed || (await exists(scope, conversationId));
      return outcome(scope, conversationId, found);
    },
    // "Devolver ao Bot": the Conversation stays on the waiting list.
    async returnToBot(scope: TenantScope, conversationId: string) {
      return outcome(
        scope,
        conversationId,
        await resumeFromDashboard(db, scope, [conversationId], false, clock.now()),
      );
    },
    async bulkReturnToBot(scope: TenantScope, conversationIds: string[]) {
      const ids = [...new Set(conversationIds)];
      if (!(await resumeFromDashboard(db, scope, ids, false, clock.now())))
        return { ok: false as const, error: "not_found" as const };
      await Promise.all(
        ids.map((conversationId) => notifyInbox(notifier, scope.tenantId, { conversationId })),
      );
      return { ok: true as const };
    },
    // "Resolvida": back to the Bot and off the waiting list.
    async resolve(scope: TenantScope, conversationId: string) {
      return outcome(
        scope,
        conversationId,
        await resumeFromDashboard(db, scope, [conversationId], true, clock.now()),
      );
    },
  };
};

export type HandoffControls = ReturnType<typeof createHandoffControls>;
