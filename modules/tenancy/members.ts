import { and, asc, count, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import { invitation, member, organization, user } from "@/db/schema";
import { createUserRepository, isPlatformAdmin } from "@/modules/identity";
import { memberInvitationEmail } from "@/modules/tenancy/invitation-email";
import {
  invitationExpiry,
  invitationLifetimeDays,
  invitationUrl,
} from "@/modules/tenancy/invitations";
import { createTenantRepository } from "@/modules/tenancy/repository";
import type { TenantScope } from "@/modules/tenancy/scope";
import type { Clock } from "@/platform/clock";
import type { Mailer } from "@/platform/mailer";

// The plan's Member allowance, owner included. Pending invitations that can
// still be accepted hold a seat.
export const memberAllowance = 10;

type MemberManagementDependencies = {
  db: Database;
  mailer: Mailer;
  clock: Clock;
  appUrl: string;
};

const newMemberInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export type NewMemberInvitation = z.input<typeof newMemberInvitationSchema>;

// Only the owner manages Members; the default roles have no finer grants.
const isOwner = (scope: TenantScope) => scope.role === "owner";

export const createMemberManagement = ({
  db,
  mailer,
  clock,
  appUrl,
}: MemberManagementDependencies) => {
  const isLivePendingIn = (tenantId: string) =>
    and(
      eq(invitation.organizationId, tenantId),
      eq(invitation.status, "pending"),
      gt(invitation.expiresAt, clock.now()),
    );

  const seatsTaken = async (tx: Database, tenantId: string) => {
    const [members] = await tx
      .select({ total: count() })
      .from(member)
      .where(eq(member.organizationId, tenantId));
    const [invitations] = await tx
      .select({ total: count() })
      .from(invitation)
      .where(isLivePendingIn(tenantId));
    return members.total + invitations.total;
  };

  return {
    // Invitations that can still be accepted, each holding a seat. Only the
    // owner, who manages them, sees them.
    async listPendingInvitations(scope: TenantScope) {
      if (!isOwner(scope)) return [];
      return db
        .select({
          id: invitation.id,
          email: invitation.email,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(isLivePendingIn(scope.tenantId))
        .orderBy(asc(invitation.createdAt), asc(invitation.id));
    },

    async cancelInvitation(scope: TenantScope, invitationId: string) {
      if (!isOwner(scope)) {
        return { ok: false as const, error: "forbidden" as const };
      }
      const canceled = await createTenantRepository(db, scope).cancelInvitation(
        invitationId,
      );
      if (!canceled) return { ok: false as const, error: "not_found" as const };
      return { ok: true as const };
    },

    async inviteMember(scope: TenantScope, input: NewMemberInvitation) {
      if (!isOwner(scope)) {
        return { ok: false as const, error: "forbidden" as const };
      }
      const parsed = newMemberInvitationSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false as const, error: "invalid" as const };
      }
      const { email } = parsed.data;

      const created = await db.transaction(async (tx) => {
        // Locking the Tenant row serialises invitations, so two at once
        // cannot both take the last seat.
        const [names] = await tx
          .select({ tenantName: organization.name, inviterName: user.name })
          .from(organization)
          .innerJoin(user, eq(user.id, scope.userId))
          .where(eq(organization.id, scope.tenantId))
          .for("update", { of: organization });

        const [existingMember] = await tx
          .select({ id: member.id })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(
            and(eq(member.organizationId, scope.tenantId), eq(user.email, email)),
          )
          .limit(1);
        if (existingMember) return { error: "already_member" as const };

        // Inviting the same email again issues a fresh link in place of the
        // old one, which also frees the old one's seat.
        await tx
          .update(invitation)
          .set({ status: "canceled" })
          .where(
            and(
              eq(invitation.organizationId, scope.tenantId),
              eq(invitation.email, email),
              eq(invitation.status, "pending"),
            ),
          );

        if ((await seatsTaken(tx, scope.tenantId)) >= memberAllowance) {
          return { error: "allowance_reached" as const };
        }

        const [inserted] = await tx
          .insert(invitation)
          .values({
            organizationId: scope.tenantId,
            email,
            role: "member",
            expiresAt: invitationExpiry(clock),
            inviterId: scope.userId,
          })
          .returning({ id: invitation.id });
        return { ...names, invitationId: inserted.id };
      });
      if (created.error) {
        return { ok: false as const, error: created.error };
      }

      const url = invitationUrl(appUrl, created.invitationId);
      const emailSent = await mailer
        .send(
          memberInvitationEmail({
            to: email,
            tenantName: created.tenantName,
            inviterName: created.inviterName,
            invitationUrl: url,
            expiresInDays: invitationLifetimeDays,
          }),
        )
        .then(() => true)
        .catch(() => false);

      return {
        ok: true as const,
        email,
        invitationId: created.invitationId,
        invitationUrl: url,
        emailSent,
      };
    },

    // Ends the Member's access at once and deletes their identity unless
    // another Tenant or the platform administrator role still needs it.
    async removeMember(scope: TenantScope, memberId: string) {
      if (!isOwner(scope)) {
        return { ok: false as const, error: "forbidden" as const };
      }

      const removed = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(member)
          .where(
            and(
              eq(member.id, memberId),
              eq(member.organizationId, scope.tenantId),
              ne(member.role, "owner"),
            ),
          )
          .returning({ userId: member.userId });
        if (!deleted) return false;

        // Locking the user makes a concurrent acceptance elsewhere wait (its
        // member insert needs the row), so the check below cannot miss it.
        await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, deleted.userId))
          .for("update");
        const users = createUserRepository(tx);
        const [otherMembership] = await tx
          .select({ id: member.id })
          .from(member)
          .where(eq(member.userId, deleted.userId))
          .limit(1);
        if (otherMembership || (await isPlatformAdmin(tx, deleted.userId))) {
          await users.revokeSessions(deleted.userId);
        } else {
          await users.delete(deleted.userId);
        }
        return true;
      });

      if (!removed) return { ok: false as const, error: "not_found" as const };
      return { ok: true as const };
    },
  };
};
