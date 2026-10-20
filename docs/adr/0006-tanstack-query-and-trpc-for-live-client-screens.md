# Use TanStack Query and tRPC for live client screens

The shared inbox (#44) needs a client cache for search, refetch on focus/reconnect, and the later invalidations and optimistic updates in #45, #47 and #57. Use TanStack Query with the tRPC TanStack integration, retaining the maintainer's provider, SuperJSON, prefetch/hydration helpers and mutation feedback pattern. Server Actions remain the interface for forms in settings, Knowledge base, Members and admin; tRPC serves data a live client screen reads and changes, including the inbox's Contact editor.

## Boundaries

- Routers and request adapters live in `server/trpc/`, call module interfaces and keep domain code framework-free (ADR 0005). The shared/browser integration and server-only hydration helpers live in `trpc/`. At the maintainer's request during #44 review, domain client hooks now own the browser tRPC calls, generated query keys, invalidation and transport error parsing. Components call hooks such as `useConversationList()`, `useConversation(id)` and `useContactEditor(contact, conversationId)` and consume domain types. This replaces the original procedure-options injection from each component, which spread transport wiring across the UI. Server Actions in other forms remain injected as callbacks.
- Every inbox procedure uses `tenantProcedure`: validate the session, call `resolveTenantScope` from server-authenticated membership, and pass the resulting `TenantScope` to the repository (ADR 0004). Procedure inputs never accept a Tenant id. HTTP responses use `private, no-store`.
- Mount the provider only around the inbox, keyed by Tenant and Member. Server query clients are request-scoped with React `cache`; browser clients live for that provider's lifetime. No Tenant data enters a shared Next.js cache.

## Rendering and compatibility

The protected page calls its guard before prefetching, inside the segment's `loading.tsx` Suspense boundary. The server loads the initial list through the router in-process and hydrates the same generated query keys with SuperJSON. It awaits that query because the inbox uses `useQuery` for inline loading/error states: streaming a pending cache into a non-suspending consumer produced a hydration mismatch and stalled loading in development. The helpers also support pending-query dehydration for future suspending consumers. Client queries own the displayed data and invalidate the list and Conversation after a Contact edit. Cache Components and Partial Prefetching stay enabled.

This follows the [tRPC App Router guide](https://trpc.io/docs/client/nextjs/app-router-setup) and [TanStack's advanced SSR guidance](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr), checked against the installed Next.js 16.4.2 caching, Route Handler, and Server/Client Component guides. The production build passes with Cache Components and Partial Prefetching enabled. Chromium checks against that build confirm hydrated initial data without a duplicate client list request, persisted Contact edits, search, inline validation, and desktop/mobile layouts without page errors. Recheck those boundaries when upgrading the framework.

## Considered options

- Server Actions for inbox reads would make client invalidation and concurrent reads awkward, and are POST-only.
- Handwritten GET handlers would require maintaining separate request/response types and query keys. tRPC supplies those from the router.

## Contact editing

The Contact's editable phone and name are separate from its stable WhatsApp identity and refreshed profile name. Existing phone values backfill that identity in the migration. Inbound messages resolve the same Contact after an edit and do not replace Member-entered details. Phone corrections do not rewrite a WhatsApp identity or merge Contacts.
