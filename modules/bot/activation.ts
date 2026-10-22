import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { botActivation, botSettings, channel, knowledgeBaseEntry } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

export const createBotActivation = ({ db, clock }: { db: Database; clock: Clock }) => {
  const checklist = (scope: TenantScope) => ({
    profile: sql<boolean>`exists(select 1 from ${botSettings} where ${botSettings.tenantId} = ${scope.tenantId})`,
    knowledge: sql<boolean>`exists(select 1 from ${knowledgeBaseEntry} where ${knowledgeBaseEntry.tenantId} = ${scope.tenantId})`,
    tested: sql<boolean>`exists(select 1 from ${botActivation} where ${botActivation.tenantId} = ${scope.tenantId}
      and not exists(select 1 from ${botSettings} where ${botSettings.tenantId} = ${scope.tenantId} and ${botSettings.updatedAt} > ${botActivation.testedAt})
      and not exists(select 1 from ${knowledgeBaseEntry} where ${knowledgeBaseEntry.tenantId} = ${scope.tenantId} and ${knowledgeBaseEntry.updatedAt} > ${botActivation.testedAt}))`,
  });
  const status = async (scope: TenantScope) => {
    const [saved] = await db
      .select({
        ...checklist(scope),
        enabled: channel.botEnabled,
        paused: channel.botPaused,
        connected: sql<boolean>`${channel.subscriptionStatus} = 'subscribed'`,
      })
      .from(channel)
      .where(eq(channel.tenantId, scope.tenantId));
    return (
      saved ?? {
        profile: false,
        knowledge: false,
        tested: false,
        enabled: false,
        paused: false,
        connected: false,
      }
    );
  };
  return {
    status,
    async activate(scope: TenantScope) {
      if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
      const ready = checklist(scope);
      const changed = await db
        .update(channel)
        .set({ botEnabled: true, updatedAt: clock.now() })
        .where(
          and(
            eq(channel.tenantId, scope.tenantId),
            eq(channel.subscriptionStatus, "subscribed"),
            ready.profile,
            ready.knowledge,
            ready.tested,
          ),
        )
        .returning({ id: channel.id });
      return changed.length
        ? { ok: true as const }
        : { ok: false as const, error: "incomplete" as const };
    },
    // Every Member may pause the Channel independently of activation and Schedule.
    async setPaused(scope: TenantScope, paused: boolean) {
      if (typeof paused !== "boolean") return { ok: false as const, error: "invalid" as const };
      const changed = await db
        .update(channel)
        .set({ botPaused: paused, updatedAt: clock.now() })
        .where(and(eq(channel.tenantId, scope.tenantId), eq(channel.botEnabled, true)))
        .returning({ id: channel.id });
      return changed.length
        ? { ok: true as const }
        : { ok: false as const, error: "inactive" as const };
    },
  };
};
