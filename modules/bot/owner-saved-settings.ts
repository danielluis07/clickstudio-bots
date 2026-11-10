import type { z } from "zod";
import type { Database, Transaction } from "@/db/database";
import {
  recordMemberActivity,
  type MemberActivityAction,
  type TenantScope,
} from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

type SaveMetadata = { updatedByMemberId: string; updatedAt: Date };
type SavedSettings<Settings> = {
  settings: Settings;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// Tables and defaults stay with each setting. Every Member may read; only
// owners may replace validated settings, stamped with the saving Member/time
// and recorded as `action` in the activity log in the same transaction.
export const createOwnerSavedSettings = <Settings>({
  db,
  clock,
  schema,
  action,
  load,
  persist,
}: {
  db: Database;
  clock: Clock;
  schema: z.ZodType<Settings>;
  action: MemberActivityAction;
  load: (tenantId: string) => Promise<SavedSettings<Settings>>;
  persist: (tx: Transaction, scope: TenantScope, values: Settings & SaveMetadata) => Promise<void>;
}) => ({
  get: (scope: TenantScope) => load(scope.tenantId),
  async save(scope: TenantScope, input: Settings) {
    if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: "invalid" as const };
    const at = clock.now();
    await db.transaction(async (tx) => {
      await persist(tx, scope, {
        ...parsed.data,
        updatedByMemberId: scope.memberId,
        updatedAt: at,
      });
      await recordMemberActivity(tx, scope, { action, at });
    });
    return { ok: true as const };
  },
});
