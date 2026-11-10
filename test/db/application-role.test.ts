import { afterEach, beforeEach, expect, test } from "bun:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "@/db/database";
import {
  applicationRoleTimeouts,
  configureApplicationRole,
  readApplicationRole,
} from "@/db/application-role";
import { inspectDatabaseReadiness } from "@/scripts/doctor/adapters";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";

// PGlite enforces privileges after SET ROLE but applies role settings only at
// session start, so the timeouts themselves are proven on real Postgres
// (application-role.postgres.test.ts). Here: grants on the migrated schema.
let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(() => closeTestDatabase(db));

const query = (statement: string, params?: unknown[]) =>
  queryTestDatabase<Record<string, unknown>>(db, statement, params);
const configure = () => configureApplicationRole(query, { role: "app", password: "secret-app" });
const refusal = (statement: string) =>
  query(statement).then(
    () => null,
    (error: { code?: string }) => error.code,
  );

test("the application role reads and writes every migrated table", async () => {
  expect(await configure()).toEqual({ created: true, migrationHistory: true });
  await query("set role app");
  await query(
    "insert into organization (id, name, slug, created_at) values ('t', 'Negócio', 'negocio', now())",
  );
  await query("update organization set name = 'Outro' where id = 't'");
  expect(await query("select name from organization")).toEqual([{ name: "Outro" }]);
  await query("delete from organization where id = 't'");
});

test("the application role cannot create, alter or drop tables", async () => {
  await configure();
  await query("set role app");
  expect(await refusal("create table intruder (id int)")).toBe("42501");
  expect(await refusal("alter table organization add column intruder int")).toBe("42501");
  expect(await refusal("drop table organization")).toBe("42501");
  expect(await refusal("create schema intruder")).toBe("42501");
  expect((await readApplicationRole(query)).canChangeSchema).toBe(false);
});

test("the owner connection is the one that can change the schema", async () => {
  expect((await readApplicationRole(query)).canChangeSchema).toBe(true);
});

test("tables created by later migrations are granted to the application role", async () => {
  await configure();
  await query("create table later_migration (id int primary key)");
  await query("set role app");
  await query("insert into later_migration values (1)");
  expect(await query("select id from later_migration")).toEqual([{ id: 1 }]);
});

test("the timeouts are stored on the role, and running the setup again is harmless", async () => {
  await configure();
  expect(await configure()).toEqual({ created: false, migrationHistory: true });
  const [{ config }] = await query(
    "select setconfig as config from pg_db_role_setting where setrole = 'app'::regrole",
  );
  expect((config as string[]).toSorted()).toEqual(
    Object.entries(applicationRoleTimeouts)
      .map(([name, value]) => `${name}=${value}`)
      .toSorted(),
  );
});

test("the doctor can inspect migrations through the application role", async () => {
  await configure();
  await query("set role app");
  const report = await inspectDatabaseReadiness((statement) => query(statement));
  const expected = readMigrationFiles({ migrationsFolder: `${import.meta.dir}/../../drizzle` });
  expect(report.appliedMigrationNames?.length).toBe(expected.length);
  expect(report.role.canChangeSchema).toBe(false);
});

test("the setup refuses to turn the owner into the application role", async () => {
  const [{ name }] = await query("select current_user as name");
  expect(configureApplicationRole(query, { role: String(name), password: "x" })).rejects.toThrow(
    "must not be the owner",
  );
});
