import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { alertPreference } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

export type AlertPreferences = {
  handoff: boolean;
  teamMessage: boolean;
  anyMessage: boolean;
  sound: boolean;
  browserNotification: boolean;
};

// What a Member has before they change anything (#217).
export const defaultAlertPreferences: AlertPreferences = {
  handoff: true,
  teamMessage: true,
  anyMessage: false,
  sound: false,
  browserNotification: false,
};

const columns = {
  handoff: alertPreference.handoff,
  teamMessage: alertPreference.teamMessage,
  anyMessage: alertPreference.anyMessage,
  sound: alertPreference.sound,
  browserNotification: alertPreference.browserNotification,
};

// The scope's Member's own Alert preferences. A change applies only to Alerts
// raised after it: past Alerts stay as they are.
export const createMemberAlertPreferences = (
  { db, clock }: { db: Database; clock: Clock },
  scope: TenantScope,
) => ({
  async get(): Promise<AlertPreferences> {
    const [stored] = await db
      .select(columns)
      .from(alertPreference)
      .where(eq(alertPreference.memberId, scope.memberId));
    return stored ?? defaultAlertPreferences;
  },

  // Changes only the switches given and returns them all.
  async update(changes: Partial<AlertPreferences>): Promise<AlertPreferences> {
    const now = clock.now();
    const [saved] = await db
      .insert(alertPreference)
      .values({ ...defaultAlertPreferences, ...changes, memberId: scope.memberId, updatedAt: now })
      .onConflictDoUpdate({
        target: alertPreference.memberId,
        set: { ...changes, updatedAt: now },
      })
      .returning(columns);
    return saved;
  },
});

export type MemberAlertPreferences = ReturnType<typeof createMemberAlertPreferences>;
