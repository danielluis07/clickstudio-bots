# ClickStudio Bots

Next.js app (Bun runtime) with Better Auth and Drizzle on Postgres (Neon).

## Setup

```bash
bun install
```

Create `.env` with:

- `DATABASE_URL`: Neon **pooled** connection string. The app keeps one global `pg` pool and registers it with `attachDatabasePool`.
- `BETTER_AUTH_SECRET`
- `APP_URL`: e.g. `http://localhost:3000`
- `RESEND_API_KEY`: Resend API key used for invitation emails.
- `EMAIL_FROM`: verified Resend sender, e.g. `ClickStudio Bots <convites@example.com>`.

Apply migrations, then start the dev server. Neon recommends the **direct** (unpooled) connection string for migrations, so override `DATABASE_URL` for that command:

```bash
DATABASE_URL="<direct connection string>" bun run db:migrate
bun run dev
```

See [ADR 0003](docs/adr/0003-node-postgres-global-pool-on-neon.md) for why the app connects this way.

## Scripts

| Script                | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `bun run dev`         | Next.js dev server                                              |
| `bun run lint`        | ESLint                                                          |
| `bun run typecheck`   | Generate Next.js route types, then `tsc --noEmit`               |
| `bun run test`        | Bun test runner (PGlite suites included)                        |
| `bun run db:generate` | Generate a migration in `drizzle/` from `db/schema`             |
| `bun run db:migrate`  | Apply pending migrations to `DATABASE_URL`                      |
| `bun run admin:create` | Create a platform administrator (see below)                    |

## Platform administrators and Tenants

Public sign-up is disabled. Create the first platform administrator from the CLI:

```bash
ADMIN_PASSWORD="<at least 8 characters>" bun run admin:create admin@example.com "Nome do Admin"
```

The administrator signs in at `/entrar` and creates each Tenant at `/admin`, which emails the owner an invitation (pt-BR, via Resend). The owner opens `/convite/<id>`, accepts the Terms and DPA, sets a password and lands on `/painel`. A Tenant is a Better Auth organization. Public sign-up and the organization plugin's HTTP routes are disabled in `lib/create-auth.ts`, so nobody can create a Tenant or join one outside that flow.

Member-facing code reaches Tenant-owned data only through `createTenantRepository(db, scope)`. The `TenantScope` it requires can only come from `resolveTenantScope`, which checks membership on the server, so a Tenant id from the browser is never trusted.

## Database migrations

Schema lives in `db/schema`. After changing it, run `bun run db:generate` and commit the new folder under `drizzle/`. Never edit an applied migration; generate a new one.

CI fails if `db/schema` and `drizzle/` disagree. The PGlite test harness (`test/support/database.ts`) applies the same `drizzle/` migrations, so tests run against the schema that production gets.

A database created earlier with `drizzle-kit push` already has the auth tables, so the initial migration fails on it. Use a fresh database (e.g. a new Neon branch) and run `bun run db:migrate`.

## Tests

Tests are `*.test.ts` files run by `bun test`. Repository tests build their database with `createTestDatabase()` from `@/test/support/database`: an in-memory PGlite with all migrations applied. Code that depends on time takes a `Clock` (`@/lib/clock`); tests pass `createTestClock()` from `@/test/support/clock` and move it with `set` or `advance`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the migration drift check and the tests on every push and pull request.
