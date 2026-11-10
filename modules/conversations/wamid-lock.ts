import { sql } from "drizzle-orm";
import type { Transaction } from "@/db/database";

// Serialises every write about one wamid of the Tenant, such as storing it on
// a sent message, filing its echo or recording its delivery status, until the
// transaction ends.
export const lockWamid = (tx: Transaction, tenantId: string, wamid: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${wamid}`}, 0))`);
