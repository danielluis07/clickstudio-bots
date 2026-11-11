# Apply production migrations from GitHub Actions and gate the Vercel promotion on them

Production migrations run in CI, not from a developer's shell (#147). On every push to `main`, the `Migrate production` job in `.github/workflows/ci.yml` runs `bun run db:migrate` against production's **direct** connection string (ADR 0003). It runs only after `check`, `Browser tests` and `Real Postgres Bot turns` pass on the same commit. The string is the `PRODUCTION_DATABASE_DIRECT_URL` secret of the `production-database` GitHub environment, and nowhere else.

Vercel keeps building every push through its Git integration. Its **Deployment Checks** require the `Migrate production` check, so a production deployment is built but not assigned to the production domains until the migration has succeeded. New code never serves traffic against a schema it does not expect.

## Considered Options

- **Run migrations in the Vercel build step** (`buildCommand` running `db:migrate` when `VERCEL_ENV=production`): rejected. The direct connection string would have to be a Vercel environment variable, readable by every build and at runtime, beside the pooled one. Every build would migrate before it had passed CI, and a failed `next build` after a successful migration would look the same as a failed migration.
- **Deploy from GitHub Actions with the Vercel CLI**, turning off Vercel's Git deployments: rejected. It needs a Vercel token in GitHub and moves preview deployments into the workflow, and Deployment Checks give the same order without either.
- **Keep migrating by hand:** rejected. Nothing enforced the order, the credential passed through shell history, and a forgotten step shipped code against the wrong schema.

## Consequences

- **A failed migration stops the deployment.** The job fails, Deployment Checks never pass, and the previous deployment keeps serving. The Drizzle migrator applies all pending migrations in one transaction, so a failure leaves none of them applied. Fix forward with a new migration in a new pull request. Re-running the failed job is enough only when the cause was outside the repository, such as a database that could not be reached.
- **The schema can be ahead of the code that serves.** The migration lands before the new deployment is promoted, the old deployment keeps serving if the build or promotion fails, and Vercel's instant rollback puts old code on the new schema. So **every migration must work with the code already in production**:
  - Add, never repurpose. New tables and nullable columns are safe. A new `NOT NULL` column needs a default or a backfill in the same migration (`test/db/migrations.test.ts` enforces the backfill).
  - Removing or renaming a column, table or enum value takes two pull requests, each merged and deployed: the first stops the code from reading and writing it, and the second drops it. A rename is an add, a backfill, a switch in the code, then a drop.
  - A check, unique or foreign-key constraint that the running code could violate waits until no deployed code writes the violating rows.
- **Migrations run one at a time.** The job's concurrency group queues a second merge's migration behind the first and never cancels one halfway.
- **Setup outside the repository.** The `production-database` environment allows only `main`. Vercel's Deployment Checks must list `Migrate production` for production. Until both exist, the job fails or production is not gated. Renaming the job requires updating the Vercel check.
- **Locks.** The old deployment keeps serving while the migration runs, so a statement that holds an `ACCESS EXCLUSIVE` lock for long, such as rewriting a large table, blocks production until the transaction commits. Because the migrator runs inside a transaction, `CREATE INDEX CONCURRENTLY` is not available to it.
