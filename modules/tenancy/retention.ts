import { and, asc, eq, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import {
  channel,
  inboxEvent,
  member,
  memberActivity,
  organization,
  session,
  user,
  verification,
} from "@/db/schema";
import { tenantRecoveryDays } from "@/modules/tenancy/lifecycle-policy";
import type { Clock } from "@/platform/clock";

// System-only maintenance, called by the authenticated daily task. Recheck
// eligibility under the same row lock as cancellation and reactivation.
export const pruneCanceledTenants = async (db: Database, clock: Clock) => {
  const now = clock.now();
  const cutoff = new Date(now.getTime() - tenantRecoveryDays * 24 * 60 * 60 * 1000);
  const expired = and(
    lte(organization.canceledAt, cutoff),
    or(isNull(organization.lifecycleLeaseUntil), lte(organization.lifecycleLeaseUntil, now)),
  );
  const candidates = await db
    .select({ id: organization.id })
    .from(organization)
    .where(expired)
    .orderBy(asc(organization.id));
  let deleted = 0;
  for (const { id: tenantId } of candidates) {
    const removed = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(and(eq(organization.id, tenantId), expired))
        .for("update");
      if (!tenant) return false;
      const identities = await tx
        .select({ id: user.id, email: user.email })
        .from(user)
        .innerJoin(member, eq(member.userId, user.id))
        .where(eq(member.organizationId, tenantId))
        .orderBy(asc(user.id))
        .for("update", { of: user });
      const [stored] = await tx.select().from(channel).where(eq(channel.tenantId, tenantId));
      if (stored)
        await tx
          .delete(inboxEvent)
          .where(
            or(
              eq(inboxEvent.phoneNumberId, stored.phoneNumberId),
              sql`${inboxEvent.payload}->>'wabaId' = ${stored.wabaId}`,
            ),
          );
      // Shared sessions must no longer point at an organization that is gone.
      await tx
        .update(session)
        .set({ activeOrganizationId: null })
        .where(eq(session.activeOrganizationId, tenantId));
      // All product data, including encrypted Channel tokens, cascades from
      // the Tenant. Manual billing/invoices are held outside this database.
      await tx.delete(organization).where(eq(organization.id, tenantId));
      // The activity log has no foreign key to cascade through. Its trigger
      // allows these deletes only now that the Tenant row is gone.
      await tx.delete(memberActivity).where(eq(memberActivity.tenantId, tenantId));
      for (const identity of identities) {
        const exclusive = and(
          eq(user.id, identity.id),
          ne(user.role, "admin"),
          notExists(
            tx.select({ id: member.id }).from(member).where(eq(member.userId, identity.id)),
          ),
        );
        const [removedUser] = await tx.delete(user).where(exclusive).returning({ id: user.id });
        if (removedUser)
          await tx
            .delete(verification)
            .where(
              or(eq(verification.value, identity.id), eq(verification.identifier, identity.email)),
            );
      }
      return true;
    });
    if (removed) deleted++;
  }
  return { deleted };
};
