# ClickStudio Bots

Next.js app (Bun runtime) with Better Auth and Drizzle on Postgres (Neon).

Use Bun 1.4.4, matching `package.json`. CI reads that version from the manifest,
restores Bun's dependency cache, and installs with the frozen lockfile.

## Setup

Voice transcription is deferred from the MVP. See the [voice-note scope decision](docs/voice-notes.md)
for unsupported-media handling and the requirements to revisit it in the future.

```bash
bun install
```

Create `.env` with:

- `DATABASE_URL`: Neon **pooled** connection string of the **dev branch**, signed in as the **application role** (see [Database roles](#database-roles)). Production's URL lives only in Vercel's environment variables, never in `.env`. The app keeps one global `pg` pool and registers it with `attachDatabasePool`.
  Use `sslmode=verify-full` in both pooled and direct connection strings to preserve certificate and hostname verification and avoid the `pg` warning about changing SSL mode semantics.
- `DATABASE_OWNER_URL`: Neon **direct** connection string of the dev branch, signed in as the **owner role**. Only `bun run db:migrate` and `bun run db:app-role` read it; the app never does.
- `BETTER_AUTH_SECRET`
- `APP_URL`: e.g. `http://localhost:3000`
- `RESEND_API_KEY`: Resend API key used for invitation emails.
- `EMAIL_FROM`: verified Resend sender, e.g. `ClickStudio Bots <convites@example.com>`.

Apply migrations, configure the application role, optionally seed the demo Tenant, then start the dev server:

```bash
bun run db:migrate
bun run db:app-role
bun run db:seed
bun run dev
```

Neon recommends the **direct** (unpooled) connection string for migrations. To migrate production, pass its owner direct string for that one command rather than storing it:

```bash
DATABASE_OWNER_URL="<production owner direct connection string>" bun run db:migrate
```

See [ADR 0003](docs/adr/0003-node-postgres-global-pool-on-neon.md) for why the app connects this way.

### Database roles

Each Neon branch has two roles ([ADR 0009](docs/adr/0009-least-privilege-application-role-with-role-level-timeouts.md)):

| Role | Can | Connection string | Used by |
| --- | --- | --- | --- |
| Owner (Neon's default, e.g. `neondb_owner`) | Everything, including creating and altering tables | `DATABASE_OWNER_URL`, direct endpoint | `bun run db:migrate`, `bun run db:app-role`. Never in Vercel |
| Application (e.g. `app`) | Read and write rows; no DDL | `DATABASE_URL`, pooled endpoint | The app in every environment, `bun run doctor`, `db:seed`, `admin:create` and the Tenant administration scripts |

The application role also carries the database timeouts: `statement_timeout` 30 s, `lock_timeout` 5 s and `idle_in_transaction_session_timeout` 10 s. They live on the role because the pooled endpoint cannot keep a session `SET`. The pool itself gives up on getting a connection after 5 s.

To set up a branch, create no role in the Neon Console: roles made there join `neon_superuser`. Instead:

1. Choose a role name and generate a password (Neon requires at least 60 bits of entropy; `openssl rand -hex 16` gives a URL-safe one).
2. Put them in `DATABASE_URL`: the branch's pooled host with that user and password.
3. Run `bun run db:migrate`, then `bun run db:app-role`. The second command creates the role, or updates its password, grants and timeouts if it exists. Run it again after changing the timeouts in `db/application-role.ts`; open connections keep the old values until they reconnect.

For production, run step 3 once with both production strings passed on the command line, then set only the pooled application string as `DATABASE_URL` in Vercel. Tables from later migrations are granted automatically, as long as migrations keep running as the same owner. `bun run doctor` fails if `DATABASE_URL` can change the schema or lacks the timeouts.

Production's Neon compute must not scale to zero: in the Neon Console, open the production branch's compute settings and disable scale to zero, so the first requests after a quiet period do not wait for the compute to start.

To enable owner-managed WhatsApp Channels, follow [WhatsApp Channel setup](docs/whatsapp-setup.md) for the Meta v4 configuration, encrypted-token keys and live validation steps.

To enable live inbox updates, set the server-only `ABLY_API_KEY` as described in [Realtime inbox setup](docs/realtime-inbox.md).

See [Phone inbox](docs/phone-inbox.md) for responsive layouts and browser checks.

To configure the Bot, start with [Behaviour settings](docs/bot-settings.md) and
[Testar Bot setup and code entry points](docs/bot-sandbox.md). The sandbox guide
explains provider keys, model access, daily limits and production isolation.
Set the server-only `AI_MODEL_ID` to choose a different model per environment
(for example, `google/gemini-2.5-flash-lite` for local Gateway testing).
[Capturing Contact details](docs/contact-capture.md) covers the capture capability.

Before testing in a browser, run `bun run doctor`. It checks local readiness
without applying migrations, seeding data or calling a Model. See
[Local readiness and branch protection](docs/local-development.md) for JSON output
and the optional provider probe.

For personal-data incidents, follow the [incident runbook](docs/incident-runbook.md),
which is pending legal review before go-live.

## Scripts

| Script                | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `bun run dev`         | Next.js dev server                                              |
| `bun run doctor`      | Read-only local readiness report ([guide](docs/local-development.md)) |
| `bun run lint`        | ESLint                                                          |
| `bun run format`      | Format code and configuration with Bun, including Tailwind class order |
| `bun run format:check` | Check formatting without changing files                       |
| `bun run typecheck`   | Generate Next.js route types, then check with native TypeScript 7 |
| `bun run typecheck:fast` | Generate Next.js route types, then check with Bun            |
| `bun run test`        | Bun test runner (PGlite suites included)                        |
| `bun run evaluate:provider --help` | Manual provider evaluation and offline human scoring ([guide](docs/evaluation/README.md)) |
| `bun run db:generate` | Generate a migration in `drizzle/` from `db/schema`             |
| `bun run db:migrate`  | Apply pending migrations as the owner (`DATABASE_OWNER_URL`, or `DATABASE_URL` when unset) |
| `bun run db:app-role` | Create or update the application role in `DATABASE_URL` ([guide](#database-roles)) |
| `bun run admin:create` | Create a platform administrator (see below)                    |
| `bun run sweep:schedule` | Create or update the QStash schedule for the sweep ([guide](docs/inbox-operations.md#the-sweep)) |
| `bun run db:seed`     | Recreate the demo Tenant on the dev database (see below)        |

## TypeScript and formatting

The `@typescript/native` dependency aliases stable TypeScript 7 and provides `tsc`
for `bun run typecheck`. The `typescript` dependency aliases Microsoft's TypeScript
6 compatibility package so ESLint and other tools can still import the JavaScript
compiler API. Keep both dependencies: replacing the compatibility alias with
TypeScript 7 would break those tools. See [Microsoft's compatibility setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).

Next.js 16.4.2 resolves the `typescript` package directly, so its build check uses
compatibility TypeScript 6. Run `bun run typecheck` to validate with TypeScript 7;
CI runs this command. `bun run typecheck:fast` is an additional local check using
Bun's bundled checker. Both commands generate Next route types first.

Editor TypeScript support is configured separately. Use the editor's native
TypeScript 7 language server for native diagnostics; the compatibility package is
retained for tools and the existing Next.js language-service plugin.

Formatting options live in `bunfig.toml`. Run `bun run format` before committing;
CI enforces `bun run format:check`. Generated migrations and Markdown documents
are excluded. Import order is preserved, and Tailwind classes are sorted using
`app/globals.css`.

## Platform administrators and Tenants

Public sign-up is disabled. Create the first platform administrator from the CLI:

```bash
ADMIN_PASSWORD="<at least 8 characters>" bun run admin:create admin@example.com "Nome do Admin"
```

The administrator signs in at `/entrar` and creates each Tenant at `/admin`, which emails the owner an invitation (pt-BR, via Resend). The owner opens `/convite/<id>`, accepts the Terms and DPA, sets a password and lands on `/painel`. A Tenant is a Better Auth organization. Public sign-up and the organization plugin's HTTP routes are disabled in `server/auth/create-auth.ts`, so nobody can create a Tenant or join one outside that flow.

`proxy.ts` sends visitors without a session cookie from `/admin` and `/painel` to `/entrar`. That is only a shortcut. Every protected `page.tsx` must call a guard from `server/auth/guards.ts` (`requireAuth`, `requireAdmin` or `requireTenantScope`) on its first line, and so must every Server Action. Each protected segment needs a `loading.tsx` for the page to read the session; see [ADR 0004](docs/adr/0004-optimistic-proxy-and-server-auth-guards.md).

Member-facing code reaches Tenant-owned data only through `createTenantRepository(db, scope)`. The `TenantScope` it requires can only come from `resolveTenantScope`, which checks membership on the server, so a Tenant id from the browser is never trusted.

## Database migrations

Schema lives in `db/schema`. After changing it, run `bun run db:generate` and commit the new folder under `drizzle/`. Never edit an applied migration; generate a new one.

CI fails if `db/schema` and `drizzle/` disagree. It also fails when a migration makes a column on an existing table `NOT NULL` without first giving existing rows a value (`test/db/migrations.test.ts`). drizzle-kit generates exactly that for a new required column, so edit the generated SQL to add the column as nullable, `UPDATE` it, then `SET NOT NULL`. The PGlite test harness (`test/support/database.ts`) applies the same `drizzle/` migrations, so tests run against the schema that production gets.

A database created earlier with `drizzle-kit push` already has the auth tables, so the initial migration fails on it. Use a fresh database (e.g. a new Neon branch) and run `bun run db:migrate`.

## Demo Tenant

`bun run db:seed` resets a demo Tenant on the dev database, for trying a change in the running app; re-run it to reopen its service window. It refuses to run unless `APP_URL` is local. It recreates the Tenant "Clínica Teste" with an owner, `dono.teste@example.com`, whose password is `SEED_PASSWORD` or `senha-teste-123`. Its Conversations cover an open and a closed service window, dashboard replies in each delivery status, and a reply by a removed Member. Its Channel has a placeholder credential, so dashboard sends from it are refused: nothing reaches Meta.

## Code layout

Layout and import rules are in [docs/CONVENTIONS.md](docs/CONVENTIONS.md#layout) and [ADR 0005](docs/adr/0005-domain-modules-with-enforced-dependency-direction.md).

## Tests

Tests are `*.test.ts` files under `test/`, organised like the code they exercise (`test/modules/tenancy/…`, `test/server/…`), and run by `bun test`. `test/architecture.test.ts` enforces the import rules. Repository tests build their database with `createTestDatabase()` from `@/test/support/database`: an in-memory PGlite with all migrations applied. Code that depends on time takes a `Clock` (`@/platform/clock`); tests pass `createTestClock()` from `@/test/support/clock` and move it with `set` or `advance`.

CI (`.github/workflows/ci.yml`) checks formatting, lint, TypeScript 7 types, migration drift and tests on every push and pull request.

The active `main` ruleset requires a pull request and the GitHub Actions `check`
status against the latest base branch. Its source is
[.github/rulesets/main.json](.github/rulesets/main.json); see the
[protection notes](docs/local-development.md#main-branch-protection).

Paid provider evaluation runs separately with the [81-case synthetic pt-BR corpus](docs/evaluation/README.md). Routine tests use a fake Model; the manual runner refuses CI.
