import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/database";
import { member } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy/scope";
import type { Clock } from "@/platform/clock";

// The scope's Member's own Tour, on their membership in the scope's Tenant:
// whether it still opens by itself. Skipping and finishing count the same.
export const createMemberTour = (
  { db, clock }: { db: Database; clock: Clock },
  scope: TenantScope,
) => {
  const ownMembership = and(
    eq(member.id, scope.memberId),
    eq(member.organizationId, scope.tenantId),
  );

  return {
    async seen() {
      const [found] = await db
        .select({ seenAt: member.tourSeenAt })
        .from(member)
        .where(ownMembership);
      return Boolean(found?.seenAt);
    },

    // Keeps the first time: marking again changes nothing.
    async markSeen() {
      await db
        .update(member)
        .set({ tourSeenAt: clock.now() })
        .where(and(ownMembership, isNull(member.tourSeenAt)));
    },
  };
};

export type MemberTour = ReturnType<typeof createMemberTour>;
