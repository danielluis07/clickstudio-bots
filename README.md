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

Apply migrations, then start the dev server:

```bash
bun run db:migrate
bun run dev
```

## Scripts

| Script                | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `bun run dev`         | Next.js dev server                                              |
| `bun run lint`        | ESLint                                                          |
| `bun run typecheck`   | `tsc --noEmit`                                                  |
| `bun run test`        | Bun test runner (PGlite suites included)                        |
| `bun run db:generate` | Generate a migration in `drizzle/` from `db/schema`             |
| `bun run db:migrate`  | Apply pending migrations to `DATABASE_URL`                      |

## Database migrations

Schema lives in `db/schema`. After changing it, run `bun run db:generate` and commit the new folder under `drizzle/`. Never edit an applied migration; generate a new one.

CI fails if `db/schema` and `drizzle/` disagree. The PGlite test harness (`test/support/database.ts`) applies the same `drizzle/` migrations, so tests run against the schema that production gets.

A database created earlier with `drizzle-kit push` already has the auth tables, so the initial migration fails on it. Use a fresh database (e.g. a new Neon branch) and run `bun run db:migrate`.

## Tests

Tests are `*.test.ts` files run by `bun test`. Repository tests build their database with `createTestDatabase()` from `@/test/support/database`: an in-memory PGlite with all migrations applied. Code that depends on time takes a `Clock` (`@/lib/clock`); tests pass `createTestClock()` from `@/test/support/clock` and move it with `set` or `advance`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the migration drift check and the tests on every push and pull request.
