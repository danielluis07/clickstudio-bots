import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "@/db/database";

const migrationsFolder = `${import.meta.dir}/../../drizzle`;

export const createTestDatabase = async (): Promise<Database> => {
  const db = drizzle({ client: new PGlite() });
  await migrate(db, { migrationsFolder });
  return db;
};
