import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Dedicated test URL only. Never fall back to the application's DATABASE_URL.
// Each run owns a fresh schema, including its migration journal.
export const createPostgresTestDatabase = async (connectionString: string) => {
  const schema = `bot_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1 });
  let pool: Pool | undefined;
  try {
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({ connectionString, max: 8, options: `-c search_path=${schema},public` });
    const db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: `${import.meta.dir}/../../drizzle`,
      migrationsSchema: schema,
    });
    return {
      db,
      close: async () => {
        await pool!.end();
        await admin.query(`drop schema "${schema}" cascade`);
        await admin.end();
      },
    };
  } catch (error) {
    await pool?.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
    throw error;
  }
};
