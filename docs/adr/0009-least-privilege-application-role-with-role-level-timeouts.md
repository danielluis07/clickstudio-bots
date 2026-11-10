# Connect the app as a least-privilege role that carries the database timeouts

The app connects to Postgres as an application role that can read and write rows but cannot create, alter or drop tables. Migrations keep running as the branch's owner role, through `DATABASE_OWNER_URL` on the direct endpoint. `bun run db:app-role` creates the application role, grants it DML on `public` (and default privileges for tables that later migrations create) and stores three timeouts on it (#148):

| Setting | Value | Why |
| --- | --- | --- |
| `statement_timeout` | 30 s | The job routes' `maxDuration`. No statement should outlive the request that sent it. |
| `lock_timeout` | 5 s | Row and advisory locks are held only in short transactions. A longer wait means something is stuck; the statement fails, the job answers 500 and QStash retries it. |
| `idle_in_transaction_session_timeout` | 10 s | No transaction spans an external call (ADR 0002), so a transaction left idle is a bug holding locks. |

The `pg` pool also sets `connectionTimeoutMillis` to 5 s, so a request that cannot get a connection fails instead of waiting forever. `bun run doctor` fails when `DATABASE_URL` can change the schema or lacks these timeouts.

## Considered Options

- **Timeouts in code, with `SET` per connection or `options=-c ...` in the connection string:** rejected. The pooled endpoint runs PgBouncer in transaction mode (ADR 0003): a session `SET` stays on the server connection and leaks to whichever client gets it next. PgBouncer does not reliably forward startup parameters such as `options` either. A setting stored on the role applies to every server connection PgBouncer opens for it.
- **`SET LOCAL` inside each transaction:** rejected as the default. It would protect only code that remembers to call it, and leave single statements outside transactions without limits. It stays available to raise a limit for one transaction.
- **A longer statement timeout for the daily tasks:** not needed now. Tenant deletion is the longest statement: one transaction per Tenant with a few deletes, most cascading from the Tenant row, well under 30 s at current volume. If one ever exceeds it, the task fails with a `daily_task_failed` alert and is retried the next day; raise the limit for that transaction with `SET LOCAL statement_timeout`, not for the role.
- **Create the application role in the Neon Console:** rejected. Neon adds roles created there to `neon_superuser`. Roles created with SQL by the owner get only what they are granted.
- **Row-level security:** not now. Isolation rests on the proof types and their tests. Revisit if a second developer or a reporting tool queries the database directly.

## Consequences

- Each Neon branch needs `bun run db:app-role` once, after `bun run db:migrate`. Running it again updates the password, grants and timeouts. Changed timeouts reach a connection only when it reconnects.
- Default privileges are recorded per creating role, so migrations must keep running as the owner that ran `db:app-role`. A table created by any other role is not granted to the app.
- `DATABASE_OWNER_URL` never goes into Vercel. When it is unset, `db:migrate` falls back to `DATABASE_URL`, which keeps a single-role database working but fails on a branch that follows this ADR.
- Production's compute must not scale to zero, a setting in the Neon Console. Otherwise the first requests after a quiet period wait for the compute to start, which eats into the pool timeout, and a webhook burst after a quiet night meets a cold cache.
- The real-Postgres suite (`bun run test:postgres`, run in CI on a Neon branch) proves the timeouts and the lock failure; the PGlite suite proves the grants on the migrated schema.
