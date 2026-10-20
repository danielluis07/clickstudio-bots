import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { createUserRepository } from "@/db/repositories/users";
import { user } from "@/db/schema";

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
    .where(
      and(eq(user.id, userId), eq(user.role, "admin"), eq(user.banned, false)),
    )
    .limit(1);
  return Boolean(found);
};
