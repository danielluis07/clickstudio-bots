import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { createUserRepository } from "@/modules/identity/users";
import { session, twoFactor, user } from "@/db/schema";

type NewPlatformAdmin = {
  name: string;
  email: string;
  password: string;
};

// Public sign-up is disabled, so administrators are provisioned from the CLI.
export const createPlatformAdmin = async (
  db: Database,
  { name, email, password }: NewPlatformAdmin,
) => {
  const passwordHash = await hashPassword(password);

  return db.transaction((tx) =>
    createUserRepository(tx).createWithPassword({
      name,
      email: email.trim().toLowerCase(),
      emailVerified: true,
      role: "admin",
      passwordHash,
    }),
  );
};

export const isPlatformAdmin = async (db: Database, userId: string) => {
  const [found] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.role, "admin"), eq(user.banned, false)))
    .limit(1);
  return Boolean(found);
};

// For an administrator who lost both the authenticator app and the backup
// codes (#149). Drops the second factor and ends every session, so the next
// sign-in with the password leads straight to setting up a new one. Returns
// false when no administrator has that email.
export const resetPlatformAdminSecondFactor = (db: Database, email: string) =>
  db.transaction(async (tx) => {
    const [admin] = await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(and(eq(user.email, email.trim().toLowerCase()), eq(user.role, "admin")))
      .returning({ id: user.id });
    if (!admin) return false;
    await tx.delete(twoFactor).where(eq(twoFactor.userId, admin.id));
    await tx.delete(session).where(eq(session.userId, admin.id));
    return true;
  });
