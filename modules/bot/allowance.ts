import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { botReplyUsage } from "@/db/schema";
import type { BotTurn } from "@/modules/bot/repository";
import { botTimeZone } from "@/modules/bot/schedule";
import { countPendingBotReplies } from "@/modules/conversations";
import { findTenantOwnerEmail, type TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";
import type { Mailer } from "@/platform/mailer";

export const monthlyReplyLimit = 5000;
export const replyWarningThreshold = 4000;

// Called in the acknowledgment transaction, only for a newly accepted production reply.
export const recordBotReplyUsage = async (
  tx: Transaction,
  scope: BotTurn["scope"] | TenantScope,
  at: Date,
) => {
  await tx
    .insert(botReplyUsage)
    .values({
      tenantId: scope.tenantId,
      period: periodAt(at),
      replies: 1,
    })
    .onConflictDoUpdate({
      target: [botReplyUsage.tenantId, botReplyUsage.period],
      set: { replies: sql`${botReplyUsage.replies} + 1` },
    });
};

const periodAt = (at: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: botTimeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  return `${parts.find(({ type }) => type === "year")!.value}-${parts.find(({ type }) => type === "month")!.value}-01`;
};

export const createBotAllowance = ({
  db,
  clock,
  mailer,
}: {
  db: Database;
  clock: Clock;
  mailer: Mailer;
}) => {
  const read = async (scope: BotTurn["scope"] | TenantScope) => {
    const period = periodAt(clock.now());
    const [usage] = await db
      .select()
      .from(botReplyUsage)
      .where(and(eq(botReplyUsage.tenantId, scope.tenantId), eq(botReplyUsage.period, period)));
    const used = usage?.replies ?? 0;
    return {
      period,
      used,
      limit: monthlyReplyLimit,
      warningThreshold: replyWarningThreshold,
      warning: used >= replyWarningThreshold,
      exhausted: used >= monthlyReplyLimit,
    };
  };
  const warningPending = () =>
    and(
      gte(botReplyUsage.replies, replyWarningThreshold),
      isNull(botReplyUsage.warningSentAt),
      or(
        isNull(botReplyUsage.warningLeaseUntil),
        lte(botReplyUsage.warningLeaseUntil, clock.now()),
      ),
    );
  const deliverWarning = async (tenantId: string, period: string) => {
    const ownerEmail = await findTenantOwnerEmail(db, tenantId);
    if (!ownerEmail) return;
    const token = crypto.randomUUID();
    const ownsClaim = and(
      eq(botReplyUsage.tenantId, tenantId),
      eq(botReplyUsage.period, period),
      eq(botReplyUsage.warningClaimToken, token),
    );
    const [claimed] = await db
      .update(botReplyUsage)
      .set({
        warningTo: sql`coalesce(${botReplyUsage.warningTo}, ${ownerEmail})`,
        warningClaimToken: token,
        warningLeaseUntil: new Date(clock.now().getTime() + 60_000),
      })
      .where(
        and(
          eq(botReplyUsage.tenantId, tenantId),
          eq(botReplyUsage.period, period),
          warningPending(),
        ),
      )
      .returning({ to: botReplyUsage.warningTo });
    if (!claimed) {
      const [unfinished] = await db
        .select({ period: botReplyUsage.period })
        .from(botReplyUsage)
        .where(
          and(
            eq(botReplyUsage.tenantId, tenantId),
            eq(botReplyUsage.period, period),
            gte(botReplyUsage.replies, replyWarningThreshold),
            isNull(botReplyUsage.warningSentAt),
          ),
        );
      // A redelivery must not acknowledge an interrupted worker's live lease:
      // QStash must keep retrying until it can recover or observe a sent warning.
      if (unfinished) throw new Error("Reply warning delivery is in progress; retry the Bot job");
      return;
    }
    // Fixed payload and recipient: every retry uses the same Resend idempotency key.
    const percent = Math.round((replyWarningThreshold / monthlyReplyLimit) * 100);
    const limit = monthlyReplyLimit.toLocaleString("pt-BR");
    const subject = `Seu Bot atingiu ${percent}% das respostas do mês`;
    const text = `${subject}: ${replyWarningThreshold.toLocaleString("pt-BR")} / ${limit}. Ao atingir ${limit} respostas, o Bot para de enviar e as novas mensagens passam para a equipe, sem cobrança adicional. O limite é renovado no início do próximo mês, no horário de São Paulo.`;
    try {
      await mailer.send({
        to: claimed.to!,
        idempotencyKey: `bot-reply-warning/${tenantId}/${period}`,
        subject,
        text,
        html: `<p>${text}</p>`,
      });
      await db
        .update(botReplyUsage)
        .set({ warningSentAt: clock.now(), warningClaimToken: null, warningLeaseUntil: null })
        .where(ownsClaim);
    } catch (error) {
      await db
        .update(botReplyUsage)
        .set({ warningClaimToken: null, warningLeaseUntil: null })
        .where(ownsClaim);
      throw error;
    }
  };
  return {
    async status(scope: TenantScope) {
      if (scope.role !== "owner") return null;
      return read(scope);
    },
    async canReply(turn: BotTurn) {
      return !(await read(turn.scope)).exhausted;
    },
    async reserve(tx: Transaction, turn: BotTurn) {
      const period = periodAt(clock.now());
      const ownsUsage = and(
        eq(botReplyUsage.tenantId, turn.scope.tenantId),
        eq(botReplyUsage.period, period),
      );
      await tx
        .insert(botReplyUsage)
        .values({ tenantId: turn.scope.tenantId, period, replies: 0 })
        .onConflictDoNothing();
      const [usage] = await tx
        .select({ used: botReplyUsage.replies })
        .from(botReplyUsage)
        .where(ownsUsage)
        .for("update");
      // Pending message rows are already durable send reservations. Count them
      // under the Tenant counter's short lock, never across a Model/Meta call.
      const pending = await countPendingBotReplies(tx, turn.scope, clock.now());
      if (usage!.used >= monthlyReplyLimit || usage!.used + pending >= monthlyReplyLimit + 2)
        throw new Error("Reply allowance is busy; retry the Bot turn");
    },
    async notifyWarning(turn: BotTurn) {
      const usage = await read(turn.scope);
      if (usage.warning) await deliverWarning(turn.scope.tenantId, usage.period);
    },
    // Cron recovers an interrupted turn or an expired email claim without any send to Meta.
    async retryWarnings() {
      const pending = await db
        .select({ tenantId: botReplyUsage.tenantId, period: botReplyUsage.period })
        .from(botReplyUsage)
        .where(warningPending())
        .orderBy(asc(botReplyUsage.period), asc(botReplyUsage.tenantId))
        .limit(100);
      const errors: unknown[] = [];
      for (const row of pending) {
        try {
          await deliverWarning(row.tenantId, row.period);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Reply allowance warnings failed");
    },
  };
};

export type ReplyAllowance = ReturnType<typeof createBotAllowance>;
export type ReplyUsage = NonNullable<Awaited<ReturnType<ReplyAllowance["status"]>>>;
