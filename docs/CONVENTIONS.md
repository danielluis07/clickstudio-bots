## Import alias

Prefer the @ alias for imports

## Component Structure

Prefer thin, declarative components and pages.  
Extract UI into dedicated components and logic into the folders described under Layout below.  
Keep files focused on composition and wiring — never leave markup or functions inline.

`components/` contains only `.tsx` UI files. Put domain-specific hooks and their browser helpers in `modules/<area>/hooks/`, never beside components. Import them through the module's separate, browser-safe hooks entry point (`@/modules/<area>/hooks`).

## Layout

| Folder | Holds | May import |
| --- | --- | --- |
| `app/` | Routes only: thin pages, layouts and route handlers | anything |
| `components/` | `.tsx` UI files only. `ui/` is shadcn; other folders group one area of the product | anything except `app/` |
| `server/` | The Next.js layer: Server Actions (`actions/`), Better Auth and guards (`auth/`), and `services.ts`, which builds module instances from real adapters | `modules/`, `platform/`, `db/`, `next/*` |
| `modules/<area>/` (except `hooks/`) | Framework-free domain logic, one folder per glossary area (`tenancy`, `identity`, `legal`, …) | other modules' `index.ts`, `platform/`, `db/schema`, `db/database` |
| `modules/<area>/hooks/` | Client hooks and their browser helpers for that domain | React, browser-safe dependencies and domain types; server operations are passed as callbacks |
| `platform/` | Environment, `Clock`, ports shared by several modules (`Mailer`) and the vendor adapters behind them | `db/`, vendor SDKs |
| `db/` | Drizzle schema (`schema/<area>.ts`), the pool and the `Database` type | `platform/` |
| `lib/` | Generic helpers with no domain meaning (`cn`, formatting) | nothing project-specific |
| `test/` | Tests, organised like the code they exercise (`test/modules/tenancy/…`), plus `support/` fakes and harnesses | anything |

Rules (enforced by `test/architecture.test.ts`; see ADR 0005):

- A module's `index.ts` is its domain interface. Its optional `hooks/index.ts` is a separate browser interface. Code outside the module imports only `@/modules/<area>` or `@/modules/<area>/hooks`, never their internal files. Files inside a module import each other directly, not through their own entry points.
- Module domain code never imports `next/*`, `react`, `server/`, `app/`, `components/`, `hooks/`, the live `db` pool or `env`. It takes dependencies (`db`, `clock`, `mailer`, …) as arguments; `server/services.ts` wires the real ones.
- Module hooks may import React, but never `next/*`, `server/`, `app/`, `components/`, `db/` or `env`. Components pass Server Actions as callbacks. Domain code must never import module hooks, and the domain `index.ts` must never re-export them.
- A port lives in the module that needs it. It moves to `platform/` only when several modules share it.
- Repositories for Tenant-owned data take a `TenantScope` (`@/modules/tenancy`) and live in the module that owns the data.
- Start a module when a glossary area gets its first code. Do not create empty folders ahead of time.
