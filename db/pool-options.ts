import type { PoolConfig } from "pg";

// Without a connection timeout, a saturated pool (or a database that stops
// answering) makes requests wait without limit. Statement, lock and
// idle-in-transaction timeouts live on the application's database role,
// because PgBouncer's transaction mode rejects session `SET` (#148).
export const databasePoolOptions = (connectionString: string): PoolConfig => ({
  connectionString,
  connectionTimeoutMillis: 5_000,
});
