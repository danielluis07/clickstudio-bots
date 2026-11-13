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

type Persist<Settings> = (
  tx: Transaction,
  scope: TenantScope,
  values: Settings & SaveMetadata,
) => Promise<void | "invalid">;

// Only owners may replace validated settings, stamped with the saving
// Member/time and recorded as `action` in the activity log in the same
// transaction. `persist` may refuse settings that are valid alone but not
// with what is saved now; nothing is written or recorded then.
export const createOwnerSave = <Settings>({
  db,
  clock,
  schema,
  action,
  persist,
}: {
  db: Database;
  clock: Clock;
  schema: z.ZodType<Settings>;
  action: MemberActivityAction;
  persist: Persist<Settings>;
}) =>
  async function save(scope: TenantScope, input: Settings) {
    if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: "invalid" as const };
    const at = clock.now();
    const refused = await db.transaction(async (tx) => {
      const result = await persist(tx, scope, {
        ...parsed.data,
        updatedByMemberId: scope.memberId,
        updatedAt: at,
      });
      if (result === "invalid") return true;
      await recordMemberActivity(tx, scope, { action, at });
      return false;
    });
    return refused ? { ok: false as const, error: "invalid" as const } : { ok: true as const };
  };

// Tables and defaults stay with each setting. Every Member may read.
export const createOwnerSavedSettings = <Settings>({
  load,
  ...save
}: Parameters<typeof createOwnerSave<Settings>>[0] & {
  load: (tenantId: string) => Promise<SavedSettings<Settings>>;
}) => ({
  get: (scope: TenantScope) => load(scope.tenantId),
  save: createOwnerSave(save),
});
