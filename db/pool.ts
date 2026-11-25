import { Pool } from "pg";
import { logError, type Diagnostic } from "@/platform/diagnostics";

// Without a connection timeout, a saturated pool (or a database that stops
// answering) makes requests wait without limit. It also bounds the wait for
// Neon's compute to wake from scale to zero. Statement, lock and
// idle-in-transaction timeouts live on the application's database role,
// because PgBouncer's transaction mode rejects session `SET` (#148).
//
// Neon closes connections when its compute scales to zero or restarts. pg
// then emits "error" on the pool for an idle connection it already dropped;
// unhandled, that event would crash the instance. The next query opens a new
// connection, so logging is all that is left to do.
export const createDatabasePool = (connectionString: string, log?: (entry: Diagnostic) => void) => {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  pool.on("error", (error) => logError("database_connection_lost", error, {}, log));
  return pool;
};
