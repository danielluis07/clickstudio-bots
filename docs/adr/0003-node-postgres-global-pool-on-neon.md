# Connect to Neon with node-postgres over one global pool, not Neon's serverless driver

The app reaches Neon through `drizzle-orm/node-postgres`, using one module-level `pg` pool on Neon's pooled endpoint. The pool is registered with `attachDatabasePool` from `@vercel/functions`.

The app runs on Vercel Fluid compute in the Bun/Node runtime, where one instance serves many invocations. A long-lived pool reuses connections instead of opening a new one per request, which costs a TCP handshake and authentication each time. `attachDatabasePool` keeps the instance alive long enough to close idle connections before it is suspended.

The `pg` client speaks plain Postgres. Tests and local runs can point the same code at PGlite (served over a socket), a local Postgres or an ephemeral Neon branch. The PGlite harness and the real-Postgres lease suite rely on that.

## Considered Options

- **Neon HTTP driver (`neon()` with `drizzle-orm/neon-http`), the original placeholder:** rejected.
  - Each query is a separate HTTP request.
  - A transaction can only be a fixed batch of queries, with no code running between them. Drizzle's neon-http `db.transaction()` throws "No transactions support in neon-http driver".
  - The design uses short multi-statement transactions (ADR 0002).
- **Neon WebSocket driver (`Pool` from `@neondatabase/serverless` with `drizzle-orm/neon-serverless`):** rejected.
  - It does support interactive transactions.
  - Neon's Vercel examples open the pool inside each request handler and close it with `waitUntil(pool.end())`, so every request pays for a new connection.
  - A module-level pool would need the same idle-connection handling that `attachDatabasePool` provides for `pg`. It would add a Neon-only dependency and protocol for no gain.
  - It only talks to Neon's proxy, so PGlite and local Postgres would need a second driver.

## Consequences

- **No session-level features on the pooled endpoint.** It runs PgBouncer in transaction mode (`pool_mode=transaction`), so session-level advisory locks, `LISTEN`/`NOTIFY`, `SET`/`RESET` of session variables and SQL-level `PREPARE` are unavailable there. This matches ADR 0002: the Conversation lease is a column, not a lock.
- **Migrations use the direct endpoint.** Neon recommends a direct (unpooled) connection for schema migrations because tools may not support transaction pooling. Run `bun run db:migrate` with `DATABASE_URL` set to the direct connection string.
- **`pg` is bundled via `transpilePackages`.** By default Next.js excludes `pg` from the bundle. Turbopack then loads it through a hashed alias it links into the build output while `next dev` runs. Bun caches the failed lookup from before the link exists, so under `bun --bun next dev` every database request failed. Bundling `pg` avoids the alias. Revisit when Bun or Next.js fixes this.
- **Single queries lose the HTTP driver's speed.** Neon calls HTTP "the fastest option for single queries", so a one-off query on a fresh instance gives up that edge. A warm instance reuses a pooled connection instead.
- **Revisit triggers.** Reopen this decision if any route must run on the Edge runtime, which has no TCP sockets, or if Fluid compute stops reusing instances.
