import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { account, session, user } from "@/db/schema";

type NewUser = typeof user.$inferInsert;

export const createUserRepository = (db: Database) => {
  const create = async (values: NewUser) => {
    const [created] = await db.insert(user).values(values).returning();
    return created;
  };

  return {
    create,

    // A user who signs in with email and password, stored the way Better Auth
    // expects. Build the repository on a transaction to commit with other writes.
    async createWithPassword({
      passwordHash,
      ...values
    }: NewUser & { passwordHash: string }) {
      const created = await create(values);
      await db.insert(account).values({
        userId: created.id,
        accountId: created.id,
        providerId: "credential",
        password: passwordHash,
      });
      return created;
    },

    async findByEmail(email: string) {
      const [found] = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      return found ?? null;
    },

    // Signs the user out everywhere: Better Auth checks the session table on
    // every request, so a deleted row rejects the cookie that carried it.
    async revokeSessions(userId: string) {
      await db.delete(session).where(eq(session.userId, userId));
    },

    // Deletes the user with their credentials, sessions and memberships.
    async delete(userId: string) {
      await db.delete(user).where(eq(user.id, userId));
    },
  };
};
