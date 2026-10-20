import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { account, user } from "@/db/schema";

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
  };
};
