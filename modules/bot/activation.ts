import { eq, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/database";
import { botActivation, botSettings, organization } from "@/db/schema";
import { activateChannelBot, readChannelBotState, setChannelBotPaused } from "@/modules/channels";
import { readKnowledgeBaseReadiness } from "@/modules/knowledge-base";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

const activateWithSnapshot = async <T>(db: Database, activate: (tx: Transaction) => Promise<T>) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(activate, { isolationLevel: "repeatable read" });
    } catch (error) {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      const conflict =
        typeof cause === "object" && cause !== null && "code" in cause && cause.code === "40001";
      if (!conflict || attempt >= 2) throw error;
      // A competing Channel write invalidated the snapshot. Retry the entire
      // checklist, never just the flag write with readiness from the old one.
    }
  }
};

const readChecklist = async (db: Database, scope: TenantScope) => {
  const [rows, knowledge] = await Promise.all([
    db
      .select({ updatedAt: botSettings.updatedAt, testedAt: botActivation.testedAt })
      .from(organization)
      .leftJoin(botSettings, eq(botSettings.tenantId, organization.id))
      .leftJoin(botActivation, eq(botActivation.tenantId, organization.id))
      .where(eq(organization.id, scope.tenantId)),
    readKnowledgeBaseReadiness(db, scope),
  ]);
  const saved = rows[0];
  const testedAt = saved?.testedAt;
  return {
    profile: saved?.updatedAt != null,
    knowledge: knowledge.present,
    tested:
      testedAt != null &&
      (saved.updatedAt == null || saved.updatedAt <= testedAt) &&
      (knowledge.updatedAt == null || knowledge.updatedAt <= testedAt),
  };
};

export const createBotActivation = ({ db, clock }: { db: Database; clock: Clock }) => ({
  status: (scope: TenantScope) =>
    db.transaction(
      async (tx) => {
        const [checklist, state] = await Promise.all([
          readChecklist(tx, scope),
          readChannelBotState(tx, scope),
        ]);
        return { ...checklist, ...state };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ),

  async activate(scope: TenantScope) {
    if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
    // One snapshot replaces the former single-statement predicate: readiness
    // and the flag write cannot read different committed configurations.
    return activateWithSnapshot(db, async (tx) => {
      const checklist = await readChecklist(tx, scope);
      return activateChannelBot(tx, scope, {
        ready: checklist.profile && checklist.knowledge && checklist.tested,
        at: clock.now(),
      });
    });
  },

  // Every Member may pause the Channel independently of activation and Schedule.
  setPaused: (scope: TenantScope, paused: boolean) =>
    setChannelBotPaused(db, scope, { paused, at: clock.now() }),

  async markTested(scope: TenantScope, testedAt: Date) {
    if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
    // Use the turn's start time: an edit during generation still needs a test.
    await db
      .insert(botActivation)
      .values({ tenantId: scope.tenantId, testedAt })
      .onConflictDoUpdate({
        target: botActivation.tenantId,
        set: {
          testedAt: sql`greatest(${botActivation.testedAt}, ${testedAt.toISOString()}::timestamptz)`,
        },
      });
    return { ok: true as const };
  },
});

export type BotActivation = ReturnType<typeof createBotActivation>;
