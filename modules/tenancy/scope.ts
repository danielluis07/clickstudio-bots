import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { member } from "@/db/schema";

declare const tenantScopeBrand: unique symbol;

// Proof of authorized membership. Only resolveTenantScope can create one, so
// Tenant-owned data cannot be reached with a Tenant id taken from a request.
export type TenantScope = {
  readonly tenantId: string;
  readonly userId: string;
  readonly memberId: string;
  readonly role: string;
  readonly [tenantScopeBrand]: true;
};

type ScopeRequest = {
  userId: string;
  // The session's active Tenant; when absent, the user's first membership.
  activeTenantId?: string | null;
};

export const resolveTenantScope = async (
  db: Database,
  { userId, activeTenantId }: ScopeRequest,
): Promise<TenantScope | null> => {
  const [membership] = await db
    .select({
      tenantId: member.organizationId,
      userId: member.userId,
      memberId: member.id,
      role: member.role,
    })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        activeTenantId ? eq(member.organizationId, activeTenantId) : undefined,
      ),
    )
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);

  return membership ? (membership as TenantScope) : null;
};
