import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { user } from "@/db/schema";

type NewUser = typeof user.$inferInsert;

export const createUserRepository = (db: Database) => ({
  async create(values: NewUser) {
    const [created] = await db.insert(user).values(values).returning();
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
});
