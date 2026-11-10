import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { inspectDatabaseReadiness } from "@/scripts/doctor/adapters";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(() => closeTestDatabase(db));

// The shared Database type erases driver-specific result shapes. This harness
// uses PGlite, whose raw query results expose rows just like node-postgres.
const query = async (statement: string) => {
  const result = (await db.execute(sql.raw(statement))) as { rows: Record<string, unknown>[] };
  return result.rows;
};
const inspect = () => inspectDatabaseReadiness(query);

test("database inspection reads the actual Drizzle migration names without creating a Member", async () => {
  const expected = readMigrationFiles({ migrationsFolder: `${import.meta.dir}/../../drizzle` }).map(
    ({ name }) => name,
  );
  const report = await inspect();
  expect(report.appliedMigrationNames?.toSorted()).toEqual(expected.toSorted());
  expect(report.ownerAvailable).toBe(false);
  expect(await db.select().from(member)).toEqual([]);
});

test("an existing owner is detected without exposing or changing their records", async () => {
  await db.insert(user).values({ id: "owner", name: "Ana", email: "ana@example.com" });
  await db.insert(organization).values({ id: "tenant", name: "Negócio", slug: "negocio" });
  await db.insert(member).values({ userId: "owner", organizationId: "tenant", role: "owner" });
  const before = await db.select().from(member);
  expect((await inspect()).ownerAvailable).toBe(true);
  expect(await db.select().from(member)).toEqual(before);
});

test("inspection reads the connected role's timeouts and schema rights without changing them", async () => {
  // PGlite connects as a superuser with no timeouts: exactly what the doctor rejects.
  const { role } = await inspect();
  expect(role).toEqual({
    timeouts: { statement_timeout: 0, lock_timeout: 0, idle_in_transaction_session_timeout: 0 },
    canChangeSchema: true,
  });
});

test("inspection reports absent migration metadata without recreating it", async () => {
  await db.execute(sql`drop schema drizzle cascade`);
  expect((await inspect()).appliedMigrationNames).toBeNull();
  const rows = await query("select to_regclass('drizzle.__drizzle_migrations') as migration_table");
  expect(rows[0].migration_table).toBeNull();
});
