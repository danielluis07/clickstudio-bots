import { Pool } from "pg";

// A request that cannot get a connection, because the pool is saturated or
// the database does not answer, fails after this instead of waiting forever.
export const poolConnectionTimeoutMs = 5_000;

export const createDatabasePool = (connectionString: string) =>
  new Pool({ connectionString, connectionTimeoutMillis: poolConnectionTimeoutMs });
