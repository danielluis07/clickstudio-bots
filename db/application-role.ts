import { escapeIdentifier, escapeLiteral } from "pg";

// Defaults stored on the application's role, in milliseconds, as pg_settings
// reports them. The pooled endpoint runs PgBouncer in transaction mode, so a
// session SET would leak to the next client of that connection (ADR 0009).
// - statement_timeout matches the job routes' maxDuration: no statement
//   should outlive the request that sent it. Tenant deletion fits well inside.
// - lock_timeout: locks are held only in short transactions. A wait this long
//   means something is stuck; the job fails and QStash retries it.
// - idle_in_transaction_session_timeout: no transaction spans an external
//   call (ADR 0002), so an idle open transaction is a bug holding locks.
export const applicationRoleTimeouts = {
  statement_timeout: 30_000,
  lock_timeout: 5_000,
  idle_in_transaction_session_timeout: 10_000,
} as const;

export type ApplicationRoleTimeout = keyof typeof applicationRoleTimeouts;

type Query = (statement: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

// Creates or updates the application's role through the owner's connection.
// The role may read and write rows but never create, alter or drop tables.
// Default privileges cover tables that later migrations create, as long as
// migrations keep running as this same owner. Safe to run again.
export const configureApplicationRole = async (
  query: Query,
  { role, password, schema = "public" }: { role: string; password: string; schema?: string },
) => {
  const [owner] = await query(
    `select current_user as name, current_database() as database,
    to_regclass('drizzle.__drizzle_migrations') is not null as migrated,
    exists(select 1 from pg_roles where rolname = $1) as role_exists`,
    [role],
  );
  if (owner.name === role) throw new Error("The application role must not be the owner role");
  const name = escapeIdentifier(role);
  const target = escapeIdentifier(schema);
  const statements = [
    `${owner.role_exists ? "alter" : "create"} role ${name} with login password ${escapeLiteral(password)}`,
    `grant connect on database ${escapeIdentifier(String(owner.database))} to ${name}`,
    `grant usage on schema ${target} to ${name}`,
    // Postgres before 15 lets every role create tables in public.
    `revoke create on schema ${target} from public, ${name}`,
    `grant select, insert, update, delete on all tables in schema ${target} to ${name}`,
    `grant usage, select, update on all sequences in schema ${target} to ${name}`,
    `alter default privileges in schema ${target} grant select, insert, update, delete on tables to ${name}`,
    `alter default privileges in schema ${target} grant usage, select, update on sequences to ${name}`,
    // `bun run doctor` reads the migration history through DATABASE_URL.
    ...(owner.migrated
      ? [
          `grant usage on schema drizzle to ${name}`,
          `grant select on drizzle.__drizzle_migrations to ${name}`,
        ]
      : []),
    ...Object.entries(applicationRoleTimeouts).map(
      ([setting, milliseconds]) => `alter role ${name} set ${setting} = ${milliseconds}`,
    ),
  ];
  await query("begin");
  try {
    for (const statement of statements) await query(statement);
    await query("commit");
  } catch (error) {
    await query("rollback");
    throw error;
  }
  return { created: !owner.role_exists, migrationHistory: owner.migrated === true };
};

// What the connected session actually gets: role settings apply at session
// start, so this reflects the role behind the connection string.
export const readApplicationRole = async (query: (statement: string) => ReturnType<Query>) => {
  const names = Object.keys(applicationRoleTimeouts).map(escapeLiteral).join(", ");
  const settings = await query(`select name, setting from pg_settings where name in (${names})`);
  const [privileges] = await query(`select
    has_schema_privilege('public', 'CREATE') as can_create,
    exists(select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and pg_has_role(c.relowner, 'MEMBER')) as owns_tables`);
  const timeouts = Object.fromEntries(
    settings.map(({ name, setting }) => [String(name), Number(setting)]),
  ) as Record<ApplicationRoleTimeout, number>;
  return {
    timeouts,
    canChangeSchema: privileges.can_create === true || privileges.owns_tables === true,
  };
};

export const differingTimeouts = (timeouts: Partial<Record<ApplicationRoleTimeout, number>>) =>
  (Object.keys(applicationRoleTimeouts) as ApplicationRoleTimeout[]).filter(
    (setting) => timeouts[setting] !== applicationRoleTimeouts[setting],
  );
