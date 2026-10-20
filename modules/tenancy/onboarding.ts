import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/database";
import {
  account,
  invitation,
  legalAcceptance,
  member,
  organization,
  user,
} from "@/db/schema";
import { createUserRepository, isPlatformAdmin } from "@/modules/identity";
import { termsVersion } from "@/modules/legal";
import { tenantOwnerInvitationEmail } from "@/modules/tenancy/invitation-email";
import {
  invitationExpiry,
  invitationLifetimeDays,
  invitationUrl,
} from "@/modules/tenancy/invitations";
import type { Clock } from "@/platform/clock";
import type { Mailer } from "@/platform/mailer";

type TenantOnboardingDependencies = {
  db: Database;
  mailer: Mailer;
  clock: Clock;
  appUrl: string;
};

const newTenantSchema = z.object({
  tenantName: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().toLowerCase().pipe(z.email()),
});

export type NewTenant = z.input<typeof newTenantSchema>;

// Better Auth's default email/password length limits.
const newMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});

export type InvitationAcceptance = {
  invitationId: string;
  acceptedTerms: boolean;
  // Ignored when the invited email already has an account.
  name?: string;
  password: string;
};

const findUserWithPassword = async (db: Database, email: string) => {
  const [found] = await db
    .select({ id: user.id, passwordHash: account.password })
    .from(user)
    .leftJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "credential")),
    )
    .where(eq(user.email, email))
    .limit(1);
  return found ?? null;
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const createTenantOnboarding = ({
  db,
  mailer,
  clock,
  appUrl,
}: TenantOnboardingDependencies) => {
  const findInvitation = async (invitationId: string) => {
    const [found] = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        tenantName: organization.name,
        existingUserId: user.id,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .leftJoin(user, eq(user.email, invitation.email))
      .where(eq(invitation.id, invitationId))
      .limit(1);
    if (!found) return null;
    const { existingUserId, ...rest } = found;
    return {
      ...rest,
      hasAccount: existingUserId !== null,
      canAccept: found.status === "pending" && found.expiresAt > clock.now(),
    };
  };

  return {
    findInvitation,

    async createTenant(actorUserId: string, input: NewTenant) {
      if (!(await isPlatformAdmin(db, actorUserId))) {
        return { ok: false as const, error: "forbidden" as const };
      }
      const parsed = newTenantSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false as const, error: "invalid" as const };
      }
      const { tenantName, ownerEmail } = parsed.data;
      const tenantId = Bun.randomUUIDv7();

      const created = await db.transaction(async (tx) => {
        await tx.insert(organization).values({
          id: tenantId,
          name: tenantName,
          slug: `${slugify(tenantName)}-${tenantId.slice(-8)}`,
        });
        const [ownerInvitation] = await tx
          .insert(invitation)
          .values({
            organizationId: tenantId,
            email: ownerEmail,
            role: "owner",
            expiresAt: invitationExpiry(clock),
            inviterId: actorUserId,
          })
          .returning({ id: invitation.id });
        return ownerInvitation;
      });

      const url = invitationUrl(appUrl, created.id);
      const emailSent = await mailer
        .send(
          tenantOwnerInvitationEmail({
            to: ownerEmail,
            tenantName,
            invitationUrl: url,
            expiresInDays: invitationLifetimeDays,
          }),
        )
        .then(() => true)
        .catch(() => false);

      return {
        ok: true as const,
        tenantId,
        ownerEmail,
        invitationId: created.id,
        invitationUrl: url,
        emailSent,
      };
    },

    async acceptInvitation(input: InvitationAcceptance) {
      const { invitationId, acceptedTerms, password } = input;

      const pending = await findInvitation(invitationId);
      if (!pending?.canAccept) {
        return { ok: false as const, error: "unavailable" as const };
      }
      // The owner assents to the Terms and DPA on the business's behalf;
      // Members join under that assent.
      if (pending.role === "owner" && !acceptedTerms) {
        return { ok: false as const, error: "terms_required" as const };
      }

      const existingUser = await findUserWithPassword(db, pending.email);
      let newUser: { name: string; passwordHash: string } | null = null;
      if (existingUser) {
        const valid =
          existingUser.passwordHash !== null &&
          (await verifyPassword({ hash: existingUser.passwordHash, password }));
        if (!valid) {
          return { ok: false as const, error: "wrong_password" as const };
        }
      } else {
        const parsed = newMemberSchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false as const, error: "invalid" as const };
        }
        newUser = {
          name: parsed.data.name,
          passwordHash: await hashPassword(parsed.data.password),
        };
      }

      const accepted = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(invitation)
          .set({ status: "accepted" })
          .where(
            and(
              eq(invitation.id, invitationId),
              eq(invitation.status, "pending"),
              // Re-checked here: an invitation that expired since the read
              // above no longer holds a seat.
              gt(invitation.expiresAt, clock.now()),
            ),
          )
          .returning();
        if (!claimed) return null;

        const userId = newUser
          ? (
              await createUserRepository(tx).createWithPassword({
                ...newUser,
                email: claimed.email,
                // Following the emailed link proves ownership of the address.
                emailVerified: true,
              })
            ).id
          : existingUser?.id;
        if (!userId) return null;

        await tx
          .insert(member)
          .values({
            organizationId: claimed.organizationId,
            userId,
            role: claimed.role ?? "member",
          })
          .onConflictDoNothing();
        if (claimed.role === "owner") {
          await tx.insert(legalAcceptance).values({
            tenantId: claimed.organizationId,
            userId,
            invitationId: claimed.id,
            termsVersion,
            acceptedAt: clock.now(),
          });
        }
        return { userId, tenantId: claimed.organizationId, email: claimed.email };
      });

      if (!accepted) {
        return { ok: false as const, error: "unavailable" as const };
      }
      return { ok: true as const, ...accepted };
    },
  };
};
