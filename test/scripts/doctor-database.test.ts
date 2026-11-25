import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { configureAppRole } from "@/scripts/database-role/configure";
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

test("inspection reports absent migration metadata without recreating it", async () => {
  await db.execute(sql`drop schema drizzle cascade`);
  expect((await inspect()).appliedMigrationNames).toBeNull();
  const rows = await query("select to_regclass('drizzle.__drizzle_migrations') as migration_table");
  expect(rows[0].migration_table).toBeNull();
});

test("inspection reports the session's timeouts, with 0 meaning none", async () => {
  expect((await inspect()).timeouts).toEqual({
    statementTimeout: "0",
    lockTimeout: "0",
    idleInTransactionSessionTimeout: "0",
  });
  await query("set statement_timeout = '30s'");
  await query("set lock_timeout = '5s'");
  await query("set idle_in_transaction_session_timeout = '15s'");
  expect((await inspect()).timeouts).toEqual({
    statementTimeout: "30s",
    lockTimeout: "5s",
    idleInTransactionSessionTimeout: "15s",
  });
});

test("inspection tells an owner, who can change the schema, from the app role", async () => {
  expect((await inspect()).canChangeSchema).toBe(true);
  await configureAppRole(query, { role: "clickstudio_app", password: "a-long-test-password" });
  await query("set role clickstudio_app");
  const report = await inspect();
  await query("reset role");
  expect(report.canChangeSchema).toBe(false);
  expect(report.appliedMigrationNames?.length).toBeGreaterThan(0);
});

test("a role that inherits a table owner's rights can change the schema", async () => {
  await query("revoke create on schema public from public");
  await query("create role table_owner");
  await query("alter table organization owner to table_owner");
  await query("create role inherits_owner");
  await query("grant table_owner to inherits_owner");
  // Doctor reads members and the migration journal.
  await query("grant select on all tables in schema public to inherits_owner");
  await query("grant usage on schema drizzle to inherits_owner");
  await query("grant select on all tables in schema drizzle to inherits_owner");
  await query("set role inherits_owner");
  const report = await inspect().catch(async (error) => {
    await query("reset role");
    throw error;
  });
  await query("reset role");
  expect(report.canChangeSchema).toBe(true);
});

test("a member that does not inherit the table owner's rights can still SET ROLE to it", async () => {
  await query("revoke create on schema public from public");
  await query("create role table_owner");
  await query("alter table organization owner to table_owner");
  await query("create role switches_to_owner noinherit");
  await query("grant table_owner to switches_to_owner");
  await query("grant select on all tables in schema public to switches_to_owner");
  await query("grant usage on schema drizzle to switches_to_owner");
  await query("grant select on all tables in schema drizzle to switches_to_owner");
  await query("set role switches_to_owner");
  const report = await inspect().catch(async (error) => {
    await query("reset role");
    throw error;
  });
  await query("reset role");
  expect(report.canChangeSchema).toBe(true);
});
