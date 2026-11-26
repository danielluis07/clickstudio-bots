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

- `DATABASE_URL`: Neon **pooled** connection string of the **dev branch**, for the **application role** (see [Database roles](#database-roles)). Production's URL lives only in Vercel's environment variables, never in `.env`. The app keeps one global `pg` pool and registers it with `attachDatabasePool`.
- `DATABASE_MIGRATION_URL`: **direct** connection string of the same branch, for the **schema owner** role. Only `bun run db:migrate` and `bun run db:roles` read it; the app never does.
  Use `sslmode=verify-full` in both pooled and direct connection strings to preserve certificate and hostname verification and avoid the `pg` warning about changing SSL mode semantics.
- `BETTER_AUTH_SECRET`
- `APP_URL`: e.g. `http://localhost:3000`
- `RESEND_API_KEY`: Resend API key used for invitation emails.
- `EMAIL_FROM`: verified Resend sender, e.g. `ClickStudio Bots <convites@example.com>`.

Apply migrations, optionally seed the demo Tenant, then start the dev server:

```bash
bun run db:migrate
bun run db:seed
bun run dev
```

Neon recommends the **direct** (unpooled) connection string for migrations, so `db:migrate` reads `DATABASE_MIGRATION_URL` (falling back to `DATABASE_URL` when it is unset). Never migrate production by hand: CI applies production migrations on merge to `main` (see [Database migrations](#database-migrations)).

See [ADR 0003](docs/adr/0003-node-postgres-global-pool-on-neon.md) for why the app connects this way.

To enable owner-managed WhatsApp Channels, follow [WhatsApp Channel setup](docs/whatsapp-setup.md) for the Meta v4 configuration, encrypted-token keys and live validation steps.

To try Tenant billing, set `BILLING_ENABLED=true` and Mercado Pago's test credentials (`MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_WEBHOOK_SECRET`) as described in [Billing](docs/billing.md#mercado-pago-setup), which also lists the test cards.

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
| `bun run db:migrate`  | Apply pending migrations to `DATABASE_MIGRATION_URL` (or `DATABASE_URL`) |
| `bun run db:roles`    | Create or update the application role ([Database roles](#database-roles)) |
| `bun run admin:create` | Create a platform administrator (see below)                    |
| `bun run sweep:schedule` | Create or update the QStash schedule for the sweep ([guide](docs/inbox-operations.md#the-sweep)) |
| `bun run billing:launch` | Start every Tenant's 30-day Trial when billing is turned on ([guide](docs/billing.md)) |
| `bun run db:seed`     | Recreate the demo Tenant on the dev database (see below)        |
| `bun run db:seed:showcase` | Recreate the showcase Tenant for screenshots and sales demos (see below) |

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

On every push to `main`, the `Migrate production` CI job applies pending migrations to production after `check`, `Browser tests` and `Real Postgres Bot turns` pass. Vercel's Deployment Checks hold the new deployment off the production domains until that job succeeds, so a failed migration leaves the previous deployment serving. The direct connection string exists only as the `PRODUCTION_DATABASE_DIRECT_URL` secret of the `production-database` GitHub environment. Every migration must work with the code already in production; removing or renaming a column takes two deployments. See [ADR 0009](docs/adr/0009-production-migrations-gate-the-vercel-promotion.md) for the rules and what to do when a migration fails.

A database created earlier with `drizzle-kit push` already has the auth tables, so the initial migration fails on it. Use a fresh database (e.g. a new Neon branch) and run `bun run db:migrate`.

## Database roles

Each Neon branch has two roles:

| Role | Rights | Connection string | Used by |
| --- | --- | --- | --- |
| Schema owner (e.g. `neondb_owner`) | Owns the schema; creates and alters tables | **Direct**: `DATABASE_MIGRATION_URL` locally, the `PRODUCTION_DATABASE_DIRECT_URL` secret in CI | `bun run db:migrate`, `bun run db:roles`, the `Migrate production` CI job |
| Application (e.g. `clickstudio_app`) | Reads and writes rows; cannot create, alter or drop tables | **Pooled**: `DATABASE_URL` in `.env` and in Vercel | The app, the seeds, `bun run doctor` |

After migrating a branch, create or update its application role, connected as the schema owner:

```bash
APP_DATABASE_PASSWORD='<at least 16 random characters>' bun run db:roles --role clickstudio_app
```

Let the script create the role: roles made in the Neon console join `neon_superuser`, which the script cannot undo. The script is idempotent. It reads the password only when it creates the role, and never prints it. The password must be at least 16 printable ASCII characters with no spaces. Postgres receives only its SCRAM-SHA-256 verifier, never the password, so it can't end up in a server log. It refuses a role that is, or inherits from, the schema owner, and removes `CREATEDB`/`CREATEROLE` from an existing one. It grants row access on every existing table and, through default privileges, on every table a later migration creates. It also sets these timeouts on the role, because PgBouncer's transaction mode refuses session `SET` ([ADR 0003](docs/adr/0003-node-postgres-global-pool-on-neon.md)):

| Setting | Value | Why |
| --- | --- | --- |
| `statement_timeout` | 30s | No request statement runs that long. Tenant deletion raises it to 120s for its own transaction with `SET LOCAL`. |
| `lock_timeout` | 5s | Locks are held for a few short statements ([Locks and leases](docs/locking.md)). A job that times out fails with HTTP 500 and QStash retries it. |
| `idle_in_transaction_session_timeout` | 15s | No transaction waits on an external call, so an idle one is stuck. |

The pool itself gives up waiting for a connection after 5 seconds. When the database closes a connection the pool was keeping idle, the pool logs `database_connection_lost` instead of crashing (`db/pool.ts`).

Then copy the role's **pooled** connection string (Neon console → Connect, pick the role) into `DATABASE_URL`. `bun run doctor` fails while `DATABASE_URL` connects with a role that can change the schema or has no timeouts. Neon copies roles into a branch only when the branch is created, so a branch made before the role existed needs its own `bun run db:roles`.

For production, run the script once with production's direct string, then replace `DATABASE_URL` in Vercel's production environment with the application role's pooled string and redeploy.

### Scale to zero

Production's Neon plan does not allow turning off scale to zero. The compute suspends after 5 minutes without queries, and the next connection wakes it, usually in well under a second. Only the pool's 5-second connection timeout covers that wait; the role's timeouts start once a session is open. A wake-up slower than that fails its request with HTTP 500: Meta redelivers webhooks, QStash retries jobs, the sweep runs again 30 minutes later, and a failed daily task alerts and runs again the next day. A person loading the dashboard sees the error and reloads.

The sweep runs every 30 minutes and queries the database. At its old five-minute interval the compute never suspended and used up the Free plan's allowance; at 30 minutes it sleeps for most of each interval when nobody is writing. On a paid plan, set it back to 5 minutes as ADR 0011 describes. Watch the plan's monthly compute usage in the Neon console: a compute that uses up its allowance is suspended until the next cycle.

## Demo Tenant

`bun run db:seed` resets a demo Tenant on the dev database, for trying a change in the running app; re-run it to reopen its service window. It refuses to run unless `APP_URL` is local. It recreates the Tenant "Clínica Teste" with an owner, `dono.teste@example.com`, whose password is `SEED_PASSWORD` or `senha-teste-123`. Its Conversations cover an open and a closed service window, dashboard replies in each delivery status, and a reply by a removed Member. Its Channel has a placeholder credential, so dashboard sends from it are refused: nothing reaches Meta.

## Showcase Tenant

`bun run db:seed:showcase` resets "Odonto Alameda", a made-up dental clinic, for screenshots and sales demos. Like the demo Tenant, it refuses to run unless `APP_URL` is local. It builds 120 days of pt-BR WhatsApp history: about 2,100 Contacts and 14,000 messages, with fewer on weekends, the busiest hours in the morning, afternoon and after work, steady growth and a two-day campaign spike. About one exchange in six ends with a Handoff, and the four newest are still waiting for the team. The Channel is connected with the Bot active, and the profile, behaviour, Contact capture, links and Knowledge base are all saved. Sign in as `mariana@odonto-alameda.example.com` with `SEED_PASSWORD` or `senha-teste-123`; `rafael@` and `juliana@` on the same domain are the other Members.

The same seed builds the same Tenant, and every time is relative to now, so re-run it just before taking screenshots. Contact numbers are random numbers in the 9-0 mobile range; they are not checked against real lines. Its Channel has the same placeholder credential as the demo Tenant: dashboard replies are refused. To keep demo data out of your working dev data, create a Neon branch (e.g. `demo`) and point `DATABASE_URL` at it while you seed and present.

## Code layout

Layout and import rules are in [docs/CONVENTIONS.md](docs/CONVENTIONS.md#layout) and [ADR 0005](docs/adr/0005-domain-modules-with-enforced-dependency-direction.md).

## Tests

Tests are `*.test.ts` files under `test/`, organised like the code they exercise (`test/modules/tenancy/…`, `test/server/…`), and run by `bun test`. `test/architecture.test.ts` enforces the import rules. Repository tests build their database with `createTestDatabase()` from `@/test/support/database`: an in-memory PGlite with all migrations applied. Code that depends on time takes a `Clock` (`@/platform/clock`); tests pass `createTestClock()` from `@/test/support/clock` and move it with `set` or `advance`.

CI (`.github/workflows/ci.yml`) checks formatting, lint, TypeScript 7 types, migration drift, tests, the production build and a dependency audit (`bun audit --audit-level=high`) on every push and pull request.

The active `main` ruleset requires a pull request and the GitHub Actions `check`
and `Real Postgres Bot turns` statuses against the latest base branch. Its source is
[.github/rulesets/main.json](.github/rulesets/main.json); see the
[protection notes](docs/local-development.md#main-branch-protection).

Paid provider evaluation runs separately with the [81-case synthetic pt-BR corpus](docs/evaluation/README.md). Routine tests use a fake Model; the manual runner refuses CI.
