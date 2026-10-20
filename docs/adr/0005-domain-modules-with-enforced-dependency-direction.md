# Organise code as framework-free domain modules with an enforced dependency direction

Domain logic lives in `modules/<area>/`, one folder per glossary area. Each folder's `index.ts` is the module's whole interface. Next.js code (Server Actions, Better Auth, guards, wiring of real adapters) lives in `server/`. Vendor adapters and ports that several modules share (env, `Clock`, `Mailer`, later `JobQueue`) live in `platform/`. Drizzle schema stays central in `db/schema/`. Tests live in `test/`, arranged the way the code they exercise is. `test/architecture.test.ts` fails CI when an import points the wrong way. The table and rules are in `docs/CONVENTIONS.md`.

The spec (#37) requires a framework-free Bot core behind ports, with routes and jobs that only adapt and wire. Inbox, Conversations, the Bot, the Knowledge base, usage and Channels are about to land on one developer's part-time schedule, much of it written by AI agents. Folders named after the glossary tell a reader where a rule lives. A small interface per module keeps a change in one place. A test enforces the dependency direction, so it does not depend on review catching it. The earlier product failed through poor structure; that is the failure this guards against.

## Considered Options

- **Keep a flat `lib/`:** rejected. It already mixed domain logic, Next.js adapters, composition and vendor adapters, and nothing showed which could import which.
- **Schema colocated in each module:** rejected for now. Drizzle relations, the Better Auth adapter and drizzle-kit want one schema object. A barrel that gathers module schemas would make `db/` depend on `modules/`. One file per area under `db/schema/` keeps the tables discoverable.
- **Tests colocated with source:** rejected. Tests target a module's interface rather than single files, and the real-Postgres and evaluation suites need separate runs. A separate `test/` tree arranged by module keeps both clear.
- **A lint plugin for boundaries (e.g. `eslint-plugin-boundaries`):** rejected for now. A Bun test of about 70 lines covers the rules with no new dependency and prints the offending imports.

## Consequences

- Modules cannot read `env` or open the live pool. They receive `db`, `clock`, `mailer` and the other ports as arguments, and `server/services.ts` is the composition root.
- `createAuth` lives in `server/auth/`, not in a module, because it uses Better Auth's `nextCookies()` plugin.
- A client component that imports a module's `index.ts` pulls in everything that index exports. Client components should import only modules whose interface is browser-safe (today `legal`), or receive data as props from a Server Component.
- The rules are checked by matching import strings, not by resolving the module graph. Relative imports (`../`) go unchecked, so the project keeps using the `@/` alias.
