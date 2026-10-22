import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { botActivation, botSettings, knowledgeBaseEntry, organization } from "@/db/schema";
import { activateChannelBot, readChannelBotState, setChannelBotPaused } from "@/modules/channels";
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
    const [[saved], state] = await Promise.all([
      db.select(checklist(scope)).from(organization).where(eq(organization.id, scope.tenantId)),
      readChannelBotState(db, scope),
    ]);
    return { ...(saved ?? { profile: false, knowledge: false, tested: false }), ...state };
  };
  return {
    status,
    async activate(scope: TenantScope) {
      const ready = checklist(scope);
      return activateChannelBot(db, scope, {
        ready: sql<boolean>`${ready.profile} and ${ready.knowledge} and ${ready.tested}`,
        at: clock.now(),
      });
    },
    // Every Member may pause the Channel independently of activation and Schedule.
    async setPaused(scope: TenantScope, paused: boolean) {
      return setChannelBotPaused(db, scope, { paused, at: clock.now() });
    },
  };
};
