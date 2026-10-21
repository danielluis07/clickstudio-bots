# Redirect on a session cookie in the proxy; authorize in server guards

`proxy.ts` matches the protected areas (`/admin`, `/painel`) and redirects a request to `/entrar?voltar=<path>` when it has no Better Auth session cookie (`getSessionCookie`). It does not validate the session or read any role. The proxy is an optimistic check that saves a render for signed-out visitors.

Authorization lives in the guards in `server/auth/guards.ts`:

- `requireAuth` validates the session with Better Auth.
- `requireAdmin` also checks `session.user.role`. It is a Better Auth field with `input: false`, so users cannot change it through `/update-user`. The platform has a single administrator, provisioned with `bun run admin:create`.
- `requireTenantScope` also resolves the Tenant from authorized membership.

Every protected `page.tsx` calls one on its first line, and every Server Action calls one before doing anything. With Cache Components a session read must sit inside a Suspense boundary, so each protected segment has a `loading.tsx`, which wraps the page in one. Domain modules check again where they own the rule. For example, `createTenant` refuses a non-admin actor.

## Considered Options

- **Validate the session in the proxy** (call `auth.api.getSession` or fetch `/api/auth/get-session`): rejected.
  - The proxy runs on every matched request, including prefetches and RSC navigations, so each one would pay for a database round trip.
  - Next.js recommends against using the proxy for full session management or authorization.
  - The pages would still need their own checks: Server Actions and data access must authorize themselves either way.
- **Check in shared layouts** (`app/(protected)/admin/layout.tsx`, `app/(protected)/painel/layout.tsx`): rejected. Layouts do not re-render on client navigation, and they do not stop child segments from rendering or reaching the RSC payload. The dashboard shell reads the session under Suspense to display the Tenant and Member; that read does not replace a page's guard.

## Consequences

- **A forged or stale cookie passes the proxy.** The page's guard then redirects or returns a 404, so the cookie check is never trusted for access.
- **Guard redirects happen after streaming starts.** The `loading.tsx` fallback is already on its way, so a failed guard redirects on the client and `notFound()` comes with HTTP 200, not 404. Signed-out visitors still get a real 307 from the proxy.
- **New protected areas need three edits:** add the prefix to the proxy's `matcher`, add a `loading.tsx` to the segment, and call a guard in each page and action. Without the `loading.tsx` the build fails, so that one cannot be forgotten. Forgetting the matcher only costs a wasted render. Forgetting the guard is a security bug, so review new pages for it.
- **`voltar` is untrusted input.** The sign-in action follows it only through `safeReturnPath`, which keeps same-origin paths and falls back to `/painel`.
- **No redirect away from `/entrar` for cookie holders.** A stale cookie would otherwise bounce between `/entrar` and `/painel`.
