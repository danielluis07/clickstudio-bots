import { and, eq, gt, inArray, lt, lte, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { botTurnRecord } from "@/db/schema";
import type { TurnTokens } from "@/modules/bot/turn";
import type { ChannelRoute } from "@/modules/channels";
import type { Clock } from "@/platform/clock";
import type { Diagnostics } from "@/platform/diagnostics";

// How a live Bot turn ended, what it cost and how long it took (#137).
export type BotTurnRecord = {
  at: Date;
  outcome: (typeof botTurnRecord.$inferInsert)["outcome"];
  handoffReason?: (typeof botTurnRecord.$inferInsert)["handoffReason"];
  // None when the turn ended before calling the Model.
  tokens?: TurnTokens;
  durationMs: number;
};

export const recordBotTurn = async (db: Database, scope: ChannelRoute, record: BotTurnRecord) => {
  await db.insert(botTurnRecord).values({
    tenantId: scope.tenantId,
    at: record.at,
    outcome: record.outcome,
    handoffReason: record.handoffReason ?? null,
    inputTokens: record.tokens?.inputTokens ?? 0,
    outputTokens: record.tokens?.outputTokens ?? 0,
    cacheReadTokens: record.tokens?.cacheReadTokens ?? 0,
    cacheWriteTokens: record.tokens?.cacheWriteTokens ?? 0,
    toolRoundTrips: record.tokens?.toolRoundTrips ?? 0,
    durationMs: Math.max(0, Math.round(record.durationMs)),
  });
};

const retentionMonths = 13;

// Daily: deletes records older than 13 months, enough to compare a month's
// cost with the same month a year before.
export const pruneBotTurnRecords = async (db: Database, clock: Clock) => {
  const cutoff = new Date(clock.now());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
  const deleted = await db
    .delete(botTurnRecord)
    .where(lt(botTurnRecord.at, cutoff))
    .returning({ id: botTurnRecord.id });
  return deleted.length;
};

// A Tenant's "Bot indisponível" Handoffs jump when, in the last hour, there
// are at least `minHandoffs` of them, they are at least `minRate` of its
// turns that reached a decision (skips excluded), and that rate is at least
// `baselineFactor` times its rate over the six days before. A Tenant with no
// earlier turns has no baseline, so the first two conditions decide alone.
export const handoffSpikeLimits = {
  windowMs: 60 * 60_000,
  baselineMs: 6 * 24 * 60 * 60_000,
  minHandoffs: 3,
  minRate: 0.2,
  baselineFactor: 2,
} as const;

const countWhere = (condition: ReturnType<typeof sql>) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

// The sweep: alerts once per sweep for each Tenant whose Handoffs jumped.
// Sentry groups repeats per Tenant. Returns the Tenants it alerted for.
export const alertBotHandoffSpikes = async ({
  db,
  clock,
  diagnostics,
  limits = handoffSpikeLimits,
}: {
  db: Database;
  clock: Clock;
  diagnostics?: Pick<Diagnostics, "alert">;
  limits?: typeof handoffSpikeLimits;
}) => {
  const now = clock.now();
  const windowFrom = new Date(now.getTime() - limits.windowMs);
  const baselineFrom = new Date(windowFrom.getTime() - limits.baselineMs);
  const unavailable = eq(botTurnRecord.handoffReason, "bot_unavailable");
  const candidates = await db
    .select({ tenantId: botTurnRecord.tenantId })
    .from(botTurnRecord)
    .where(and(gt(botTurnRecord.at, windowFrom), lte(botTurnRecord.at, now), unavailable))
    .groupBy(botTurnRecord.tenantId)
    .having(sql`count(*) >= ${limits.minHandoffs}`);
  if (!candidates.length) return [];

  const inWindow = gt(botTurnRecord.at, windowFrom);
  const decided = ne(botTurnRecord.outcome, "skipped");
  const rows = await db
    .select({
      tenantId: botTurnRecord.tenantId,
      turns: countWhere(sql`${inWindow} and ${decided}`),
      handoffs: countWhere(sql`${inWindow} and ${unavailable}`),
      baselineTurns: countWhere(sql`not ${inWindow} and ${decided}`),
      baselineHandoffs: countWhere(sql`not ${inWindow} and ${unavailable}`),
    })
    .from(botTurnRecord)
    .where(
      and(
        inArray(
          botTurnRecord.tenantId,
          candidates.map(({ tenantId }) => tenantId),
        ),
        gt(botTurnRecord.at, baselineFrom),
        lte(botTurnRecord.at, now),
      ),
    )
    .groupBy(botTurnRecord.tenantId)
    .orderBy(botTurnRecord.tenantId);

  const spikes = rows.filter(({ turns, handoffs, baselineTurns, baselineHandoffs }) => {
    if (handoffs < limits.minHandoffs || turns === 0) return false;
    const rate = handoffs / turns;
    if (rate < limits.minRate) return false;
    return (
      baselineTurns === 0 || rate >= limits.baselineFactor * (baselineHandoffs / baselineTurns)
    );
  });
  for (const { tenantId, turns, handoffs } of spikes)
    await diagnostics?.alert({ kind: "bot_handoff_spike", tenantId, handoffs, turns });
  return spikes.map(({ tenantId }) => tenantId);
};
