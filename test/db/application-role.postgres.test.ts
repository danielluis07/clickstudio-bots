import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client, escapeIdentifier } from "pg";
import {
  applicationRoleTimeouts,
  configureApplicationRole,
  readApplicationRole,
} from "@/db/application-role";

// Dedicated test URL only, connected as a role that may create roles (the
// branch owner on Neon). The role and schema are unique to this run.
const url = process.env.BOT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const suffix = crypto.randomUUID().replaceAll("-", "");
const schema = `role_test_${suffix}`;
const role = `app_test_${suffix}`;
const password = `${crypto.randomUUID()}${crypto.randomUUID()}`;
let owner: Client;
let app: Client;

const rows = async (client: Client, statement: string) => (await client.query(statement)).rows;
const failure = (client: Client, statement: string) =>
  client.query(statement).then(
    () => null,
    (error: { code?: string }) => error.code,
  );

suite("the application role on real Postgres", () => {
  beforeAll(async () => {
    owner = new Client({ connectionString: url });
    await owner.connect();
    await owner.query(`create schema ${escapeIdentifier(schema)}`);
    await owner.query(`create table ${escapeIdentifier(schema)}.item (id int primary key)`);
    await owner.query(`insert into ${escapeIdentifier(schema)}.item values (1)`);
    await configureApplicationRole(
      async (statement, params) => (await owner.query(statement, params)).rows,
      { role, password, schema },
    );
    const appUrl = new URL(url!);
    appUrl.username = role;
    appUrl.password = password;
    app = new Client({ connectionString: appUrl.href, options: `-c search_path=${schema}` });
    await app.connect();
  });

  afterAll(async () => {
    await app?.end();
    await owner.query(`drop schema if exists ${escapeIdentifier(schema)} cascade`);
    await owner.query(`drop owned by ${escapeIdentifier(role)}`);
    await owner.query(`drop role if exists ${escapeIdentifier(role)}`);
    await owner.end();
  });

  test("every session of the role starts with the timeouts", async () => {
    const { timeouts } = await readApplicationRole((statement) => rows(app, statement));
    expect(timeouts).toEqual({ ...applicationRoleTimeouts });
  });

  test("a statement waiting on a lock past the lock timeout fails instead of waiting", async () => {
    await owner.query("begin");
    try {
      await owner.query(`select id from ${escapeIdentifier(schema)}.item where id = 1 for update`);
      const started = performance.now();
      const code = await failure(app, "select id from item where id = 1 for update");
      const elapsed = performance.now() - started;
      // lock_not_available: thrown to the job, which answers 500 so QStash retries.
      expect(code).toBe("55P03");
      expect(elapsed).toBeGreaterThanOrEqual(applicationRoleTimeouts.lock_timeout - 100);
      expect(elapsed).toBeLessThan(applicationRoleTimeouts.lock_timeout + 3_000);
    } finally {
      await owner.query("rollback");
    }
  });

  test("the role writes rows but cannot create or alter tables", async () => {
    await app.query("insert into item values (2)");
    await app.query("delete from item where id = 2");
    expect(await failure(app, "create table intruder (id int)")).toBe("42501");
    expect(await failure(app, "alter table item add column intruder int")).toBe("42501");
    expect(await failure(app, "drop table item")).toBe("42501");
  });
});
