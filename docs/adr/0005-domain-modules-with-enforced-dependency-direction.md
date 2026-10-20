# Organise code as framework-free domain modules with an enforced dependency direction

Domain logic lives in `modules/<area>/`, one folder per glossary area. Each folder's `index.ts` is the module's domain interface. An optional `hooks/` subfolder holds client hooks and their browser helpers behind a separate `hooks/index.ts`; the domain code remains framework-free. Next.js code (Server Actions, Better Auth, guards, wiring of real adapters) lives in `server/`. Vendor adapters and ports that several modules share (env, `Clock`, `Mailer`, later `JobQueue`) live in `platform/`. Drizzle schema stays central in `db/schema/`. Tests live in `test/`, arranged the way the code they exercise is. `test/architecture.test.ts` fails CI when an import points the wrong way. The table and rules are in `docs/CONVENTIONS.md`.

The spec (#37) requires a framework-free Bot core behind ports, with routes and jobs that only adapt and wire. Inbox, Conversations, the Bot, the Knowledge base, usage and Channels are about to land on one developer's part-time schedule, much of it written by AI agents. Folders named after the glossary tell a reader where a rule lives. A small interface per module keeps a change in one place. A test enforces the dependency direction, so it does not depend on review catching it. The earlier product failed through poor structure; that is the failure this guards against.

## Considered Options

- **Keep a flat `lib/`:** rejected. It already mixed domain logic, Next.js adapters, composition and vendor adapters, and nothing showed which could import which.
- **Schema colocated in each module:** rejected for now. Drizzle relations, the Better Auth adapter and drizzle-kit want one schema object. A barrel that gathers module schemas would make `db/` depend on `modules/`. One file per area under `db/schema/` keeps the tables discoverable.
- **Tests colocated with source:** rejected. Tests target a module's interface rather than single files, and the real-Postgres and evaluation suites need separate runs. A separate `test/` tree arranged by module keeps both clear.
- **A lint plugin for boundaries (e.g. `eslint-plugin-boundaries`):** rejected for now. A Bun test of about 70 lines covers the rules with no new dependency and prints the offending imports.

## Consequences

- Modules cannot read `env` or open the live pool. They receive `db`, `clock`, `mailer` and the other ports as arguments, and `server/services.ts` is the composition root.
- Updated on 2026-10-20 at the maintainer's request: `components/` contains only `.tsx` UI files. Domain-specific client hooks and browser helpers live in `modules/<area>/hooks/`. This is the explicit exception to the original blanket ban on React in modules. Hooks cannot import the Next.js/server layer or database; components inject Server Actions as callbacks. Domain code cannot import hooks.
- Updated on 2026-10-20 at the maintainer's request (ADR 0006): module hooks may also call tRPC through `useTRPC` from `@/trpc/client`, the browser-safe entry, so a domain's queries, cache keys and optimistic updates live with its other hooks. They still cannot import the router, the server caller or anything else in `trpc/`.
- `createAuth` lives in `server/auth/`, not in a module, because it uses Better Auth's `nextCookies()` plugin.
- A client component that imports a module's `index.ts` pulls in everything that index exports. Client components should import only modules whose domain interface is browser-safe (today `legal`), use the separate `@/modules/<area>/hooks` entry point, or receive data as props from a Server Component. A domain `index.ts` never re-exports hooks.
- The rules are checked by matching import strings, not by resolving the module graph. Relative imports (`../`) go unchecked, so the project keeps using the `@/` alias.
