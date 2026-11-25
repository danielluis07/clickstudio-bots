import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { configureAppRole } from "@/scripts/database-role/configure";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(() => closeTestDatabase(db));

const query = (statement: string) => queryTestDatabase<Record<string, unknown>>(db, statement);
// PGlite runs as a superuser; SET ROLE takes on the app role's privileges.
const asApp = async (statement: string) => {
  await query("set role clickstudio_app");
  try {
    return await query(statement);
  } finally {
    await query("reset role");
  }
};
const configure = () =>
  configureAppRole(query, { role: "clickstudio_app", password: "a-long-test-password" });

test("the app role reads and writes Tenant data", async () => {
  await configure();
  await asApp("insert into organization (id, name, slug) values ('tenant', 'Negócio', 'negocio')");
  await asApp("update organization set name = 'Outro' where id = 'tenant'");
  expect(await asApp("select name from organization")).toEqual([{ name: "Outro" }]);
  await asApp("delete from organization where id = 'tenant'");
  // bun run doctor reads the migration journal with this role.
  expect(await asApp("select name from drizzle.__drizzle_migrations limit 1")).toHaveLength(1);
});

test("the app role cannot create or alter tables", async () => {
  await configure();
  await expect(asApp("create table intruder (id int)")).rejects.toThrow(/permission denied/);
  await expect(asApp("alter table organization add column intruder int")).rejects.toThrow(
    /must be owner/,
  );
  await expect(asApp("drop table organization")).rejects.toThrow(/must be owner/);
  await expect(asApp("create schema intruder")).rejects.toThrow(/permission denied/);
});

test("tables a later migration creates are usable by the app role", async () => {
  await configure();
  await query("create table later_feature (id int)");
  await asApp("insert into later_feature values (1)");
  expect(await asApp("select id from later_feature")).toEqual([{ id: 1 }]);
});

test("the timeouts are set on the role, and configuring twice keeps one role", async () => {
  await configure();
  await configure();
  const rows = await query(`select unnest(s.setconfig) as setting
    from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
    where r.rolname = 'clickstudio_app' order by 1`);
  expect(rows.map(({ setting }) => setting)).toEqual([
    "idle_in_transaction_session_timeout=15s",
    "lock_timeout=5s",
    "statement_timeout=30s",
  ]);
  expect(
    await query("select count(*)::int as n from pg_roles where rolname = 'clickstudio_app'"),
  ).toEqual([{ n: 1 }]);
});

test("a new role needs a password, and role names are not SQL", async () => {
  await expect(configureAppRole(query, { role: "clickstudio_app" })).rejects.toMatchObject({
    reason: "password_required",
  });
  await expect(
    configureAppRole(query, { role: 'x"; drop table organization; --', password: "x".repeat(20) }),
  ).rejects.toMatchObject({ reason: "invalid_role_name" });
  expect(await query("select to_regclass('public.organization') is not null as kept")).toEqual([
    { kept: true },
  ]);
});

test("an existing role loses CREATEDB and CREATEROLE and keeps working", async () => {
  await query("create role clickstudio_app login createdb createrole");
  await configureAppRole(query, { role: "clickstudio_app" });
  expect(
    await query(
      "select rolcreatedb, rolcreaterole from pg_roles where rolname = 'clickstudio_app'",
    ),
  ).toEqual([{ rolcreatedb: false, rolcreaterole: false }]);
  expect(await asApp("select count(*)::int as n from organization")).toEqual([{ n: 0 }]);
});

test("a role that is, or inherits from, the schema owner is refused", async () => {
  await query("create role inherits_owner login");
  await query("grant postgres to inherits_owner");
  for (const role of ["inherits_owner", "postgres"])
    await expect(configureAppRole(query, { role, password: "x".repeat(20) })).rejects.toMatchObject(
      { reason: "role_can_change_schema" },
    );
});
