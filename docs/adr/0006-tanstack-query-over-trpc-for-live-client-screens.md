# Use TanStack Query over tRPC for live client screens; keep Server Actions for forms

The inbox reads and changes its data through TanStack Query, with tRPC as the transport. Everything else keeps the Server Components and Server Actions it uses today. The rule: **Server Actions for forms; tRPC for data a live client screen reads and changes.** Settings, Knowledge base, Members and admin stay on Server Actions.

The inbox is the first screen that needs a client-side cache, and the issues after it (#45 replies and delivery status, #47 Ably pings, #57 Handoff controls) lean on one:

- **Invalidation from pings.** Ably pings carry only ids (#47). A client cache turns "Conversation X changed" into invalidating that Conversation's queries and the list. Without one, each ping is a `router.refresh()` that re-renders the route and re-runs every query on it.
- **Refetch on focus and reconnect**, since Members keep the tab open all day.
- **Optimistic updates** that later events reconcile: renaming a Contact (#44), a sent reply and its status (#45), "Assumir" and "Devolver ao Bot" (#57).
- **Cursor pagination** of the Conversation list and of each Conversation's messages, through infinite queries.

## Shape

- `trpc/init.ts` creates tRPC with superjson, so `Date` values survive the wire. Its context is `{ db, session }`. `trpc/context.ts` builds it from Better Auth for real requests; tests pass PGlite and a plain session.
- `tenantProcedure` is the only procedure builder. It resolves the `TenantScope` with `resolveTenantScope` and refuses with `UNAUTHORIZED` (no session) or `FORBIDDEN` (no membership). This puts the ADR 0004 guard in one place. Procedures never take a Tenant id as input, and a Conversation or Contact id outside the scope is `NOT_FOUND`. `test/trpc/router.test.ts` walks every procedure in the router and checks both refusals, so a procedure added without the guard fails CI.
- Routers in `trpc/routers/` are thin adapters over `@/modules/<area>`, the role Server Actions play. Behaviour is tested at the module interface.
- `app/api/trpc/[trpc]/route.ts` delegates to `trpc/handler.ts`. Unexpected errors are logged with the procedure path only and reach the browser without their message, since database errors can echo Contact data.
- Pages still call their guard on the first line (ADR 0004), then prefetch through `trpc/server.tsx`. That caller runs procedures in-process with the same cached session, and `<HydrateClient>` hands the result to the browser cache.
- The provider is mounted in `app/painel/layout.tsx`, not the root layout, so public pages do not ship TanStack Query.
- Module hooks (`@/modules/<area>/hooks`) call `useTRPC` from `@/trpc/client`. That keeps a domain's queries, cache keys and optimistic updates together. `trpc/client.tsx` imports the router only as a type, so the browser bundle holds no server code (checked by the architecture test).

## Next.js 16 with Cache Components

tRPC's App Router guide does not cover Cache Components, and two failures are reported in the wild. `QueryClient` and `dehydrate()` read `Date.now()`, which is a prerender error outside a request. A prefetch that is not awaited can hide the `headers()` read that makes a route dynamic, and the build then fails. The inbox avoids both:

- The page calls `requireTenantScope()` first, inside the segment's `loading.tsx` Suspense boundary. The route is therefore dynamic before any query client work.
- `prefetch` and `prefetchInfinite` await the query, through TanStack's `query()` and `infiniteQuery()`. The older `prefetchQuery` and `prefetchInfiniteQuery` are deprecated in 5.104. A failed prefetch is not dehydrated, so the browser retries it and shows the error.

`bun run build` prerenders `/painel/conversas` as a partial prerender, with no prerender errors.

## Considered Options

- **Server Actions for client reads:** rejected. They are POST-only and not cacheable, and Next.js runs them one at a time per client.
- **Hand-typed GET Route Handlers with TanStack Query:** rejected. Each endpoint needs its own types, parsing and query keys, which tRPC derives from the router.
- **`router.refresh()` per change, no client cache:** rejected. It re-renders the whole route on every ping, and it offers no optimistic reconciliation.
- **tRPC everywhere:** rejected. Forms elsewhere work well with Server Actions and progressive enhancement, and moving them would add churn without benefit.

## Consequences

- Two data paths exist, and the rule above decides between them. A form inside a live screen, such as the Contact name, uses a tRPC mutation so that the screen's cache updates optimistically.
- `/api/trpc` is outside the proxy matcher. It answers 401 itself rather than redirecting, which suits an API.
- A new live screen needs a router in `trpc/routers/`, added to `appRouter`. The refusal test then covers its procedures automatically.
