import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { invitation, legalAcceptance, member, organization, user } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy/scope";

// Privileged background notifications use the Tenant id from persisted work,
// never from a request. Choose the earliest owner deterministically.
export const findTenantOwnerEmail = async (db: Database, tenantId: string) => {
  const [owner] = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, tenantId), eq(member.role, "owner")))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  return owner?.email ?? null;
};

// The single entry point to Tenant-owned data for Members: every query is
// bound to the scope's Tenant, whatever record ids the caller passes.
export const createTenantRepository = (db: Database, scope: TenantScope) => {
  const memberColumns = {
    id: member.id,
    role: member.role,
    name: user.name,
    email: user.email,
  };

  return {
    async getTenant() {
      const [found] = await db
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(eq(organization.id, scope.tenantId))
        .limit(1);
      return found ?? null;
    },

    async listMembers() {
      return db
        .select(memberColumns)
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, scope.tenantId))
        .orderBy(asc(member.createdAt), asc(member.id));
    },

    async findMember(memberId: string) {
      const [found] = await db
        .select(memberColumns)
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(and(eq(member.id, memberId), eq(member.organizationId, scope.tenantId)))
        .limit(1);
      return found ?? null;
    },

    async listLegalAcceptances() {
      return db
        .select({
          memberName: user.name,
          termsVersion: legalAcceptance.termsVersion,
          acceptedAt: legalAcceptance.acceptedAt,
        })
        .from(legalAcceptance)
        .innerJoin(user, eq(user.id, legalAcceptance.userId))
        .where(eq(legalAcceptance.tenantId, scope.tenantId))
        .orderBy(asc(legalAcceptance.acceptedAt));
    },

    async cancelInvitation(invitationId: string) {
      const canceled = await db
        .update(invitation)
        .set({ status: "canceled" })
        .where(
          and(
            eq(invitation.id, invitationId),
            eq(invitation.organizationId, scope.tenantId),
            eq(invitation.status, "pending"),
          ),
        )
        .returning({ id: invitation.id });
      return canceled.length > 0;
    },
  };
};
