import { escapeIdentifier, escapeLiteral } from "pg";
import { scramSha256Verifier } from "@/scripts/database-role/scram";

type Query = (statement: string) => Promise<Record<string, unknown>[]>;

// Role-level defaults apply to every session the role opens, including the
// server connections PgBouncer opens for it, where session `SET` is refused
// (ADR 0003). Tenant deletion raises its own statement timeout with
// `SET LOCAL`, which transaction mode allows.
export const appRoleTimeouts = {
  statement_timeout: "30s",
  lock_timeout: "5s",
  idle_in_transaction_session_timeout: "15s",
} as const;

const roleName = /^[a-z_][a-z0-9_]{0,62}$/;

export class AppRoleSetupError extends Error {
  constructor(
    readonly reason: "invalid_role_name" | "password_required" | "role_can_change_schema",
  ) {
    super(`App role setup refused: ${reason}`);
  }
}

// Run as the schema owner: the role that owns the tables and applies
// migrations, on the direct endpoint. Idempotent. The default privileges cover
// tables later migrations create only because migrations run as this same
// role. An existing role keeps its password, loses CREATEDB and CREATEROLE,
// and is refused if it is or belongs to the schema owner.
export const configureAppRole = async (
  query: Query,
  { role, password }: { role: string; password?: string },
) => {
  if (!roleName.test(role)) throw new AppRoleSetupError("invalid_role_name");
  const app = escapeIdentifier(role);
  await query("BEGIN");
  try {
    const [{ exists, extra_rights, inherits_owner, has_drizzle, database }] = await query(`select
      exists(select 1 from pg_roles where rolname = ${escapeLiteral(role)}) as exists,
      exists(select 1 from pg_roles where rolname = ${escapeLiteral(role)}
        and (rolcreatedb or rolcreaterole)) as extra_rights,
      exists(select 1 from pg_roles where rolname = ${escapeLiteral(role)}
        and (rolsuper or pg_has_role(oid, current_user, 'MEMBER'))) as inherits_owner,
      to_regnamespace('drizzle') is not null as has_drizzle,
      current_database() as database`);
    if (inherits_owner) throw new AppRoleSetupError("role_can_change_schema");
    if (!exists) {
      // Printable ASCII, so the verifier needs no SASLprep.
      if (!password || !/^[!-~]{16,}$/.test(password))
        throw new AppRoleSetupError("password_required");
      await query(
        `create role ${app} with login password ${escapeLiteral(scramSha256Verifier(password))}`,
      );
    }
    if (extra_rights) await query(`alter role ${app} nocreatedb nocreaterole`);
    for (const [setting, value] of Object.entries(appRoleTimeouts))
      await query(`alter role ${app} set ${setting} = ${escapeLiteral(value)}`);
    await query(`grant connect on database ${escapeIdentifier(String(database))} to ${app}`);
    // Only the owner creates objects. Postgres 15 already revokes this from
    // PUBLIC; older databases and providers may not.
    await query("revoke create on schema public from public");
    await query(`revoke create on schema public from ${app}`);
    await query(`grant usage on schema public to ${app}`);
    await query(`grant select, insert, update, delete on all tables in schema public to ${app}`);
    await query(`grant usage, select on all sequences in schema public to ${app}`);
    await query(
      `alter default privileges in schema public grant select, insert, update, delete on tables to ${app}`,
    );
    await query(
      `alter default privileges in schema public grant usage, select on sequences to ${app}`,
    );
    // bun run doctor compares the migration journal with the checkout.
    if (has_drizzle) {
      await query(`grant usage on schema drizzle to ${app}`);
      await query(`grant select on all tables in schema drizzle to ${app}`);
      await query(`alter default privileges in schema drizzle grant select on tables to ${app}`);
    }
    await query("COMMIT");
  } catch (error) {
    // A failed rollback (say, a lost connection) must not hide the cause.
    await query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};
