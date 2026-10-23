import type { z } from "zod";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

type SaveMetadata = { updatedByMemberId: string; updatedAt: Date };
type SavedSettings<Settings> = {
  settings: Settings;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// Tables and defaults stay with each setting. Every Member may read; only
// owners may replace validated settings, stamped with the saving Member/time.
export const createOwnerSavedSettings = <Settings>({
  clock,
  schema,
  load,
  persist,
}: {
  clock: Clock;
  schema: z.ZodType<Settings>;
  load: (tenantId: string) => Promise<SavedSettings<Settings>>;
  persist: (scope: TenantScope, values: Settings & SaveMetadata) => Promise<void>;
}) => ({
  get: (scope: TenantScope) => load(scope.tenantId),
  async save(scope: TenantScope, input: Settings) {
    if (scope.role !== "owner") return { ok: false as const, error: "forbidden" as const };
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: "invalid" as const };
    await persist(scope, {
      ...parsed.data,
      updatedByMemberId: scope.memberId,
      updatedAt: clock.now(),
    });
    return { ok: true as const };
  },
});
