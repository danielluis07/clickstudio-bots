## Import alias

Prefer the @ alias for imports

## Component Structure

Prefer thin, declarative components and pages.  
Extract UI into dedicated components and logic into the folders described under Layout below.  
Keep files focused on composition and wiring — never leave markup or functions inline.

## Layout

| Folder | Holds | May import |
| --- | --- | --- |
| `app/` | Routes only: thin pages, layouts and route handlers | anything |
| `components/` | UI. `ui/` is shadcn; other folders group one area of the product | anything except `app/` |
| `server/` | The Next.js layer: Server Actions (`actions/`), Better Auth and guards (`auth/`), and `services.ts`, which builds module instances from real adapters | `modules/`, `platform/`, `db/`, `next/*` |
| `modules/<area>/` | Framework-free domain logic, one folder per glossary area (`tenancy`, `identity`, `legal`, …) | other modules' `index.ts`, `platform/`, `db/schema`, `db/database` |
| `platform/` | Environment, `Clock`, ports shared by several modules (`Mailer`) and the vendor adapters behind them | `db/`, vendor SDKs |
| `db/` | Drizzle schema (`schema/<area>.ts`), the pool and the `Database` type | `platform/` |
| `lib/` | Generic helpers with no domain meaning (`cn`, formatting) | nothing project-specific |
| `test/` | Tests, organised like the code they exercise (`test/modules/tenancy/…`), plus `support/` fakes and harnesses | anything |

Rules (enforced by `test/architecture.test.ts`; see ADR 0005):

- A module's `index.ts` is its interface. Code outside the module imports only `@/modules/<area>`, never a file inside it. Files inside a module import each other directly, not through their own `index.ts`.
- Modules never import `next/*`, `react`, `server/`, `app/` or `components/`, the live `db` pool or `env`. They take their dependencies (`db`, `clock`, `mailer`, …) as arguments; `server/services.ts` wires the real ones.
- A port lives in the module that needs it. It moves to `platform/` only when several modules share it.
- Repositories for Tenant-owned data take a `TenantScope` (`@/modules/tenancy`) and live in the module that owns the data.
- Start a module when a glossary area gets its first code. Do not create empty folders ahead of time.
