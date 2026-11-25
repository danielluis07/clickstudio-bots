import type { Database } from "@/db/database";
import { createDatabasePool } from "@/db/pool";
import { env } from "@/platform/env";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

const globalForDb = globalThis as unknown as { pool?: Pool };

const createPool = () => {
  const pool = createDatabasePool(env.DATABASE_URL);
  attachDatabasePool(pool);
  return pool;
};

const pool = (globalForDb.pool ??= createPool());

export const db: Database = drizzle({ client: pool });
