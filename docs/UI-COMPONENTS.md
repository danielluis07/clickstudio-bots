## Shadcn UI

Shadcn is the foundation for the design in this project. Tailwind for styling

## File placement

See [code conventions](CONVENTIONS.md#layout) for file placement, module boundaries, and hook dependencies.

## Dashboard pages

Every `/painel` page wraps its content in `DashboardPage` (`components/dashboard/dashboard-page.tsx`), so all pages start at the same left edge and top with the same spacing. Pages are never centered.

- `title` is the page's `h1`. Pass `titleHidden` to keep it for assistive technology without showing it (Visão geral).
- `description` and `actions` (for example a period picker) are optional.
- `width="full"` (default) is for lists, tables and dashboards. `width="form"` caps the width (`max-w-3xl`) for settings forms and other reading-width content.

Conversas is the one exception: its two-pane inbox fills the viewport height, so `Inbox` lays out its own `h1` with the same styles.

A section with several pages, like Bot, is a sidebar group (`DashboardNavigationGroup`) with one route per page, not one long page.

## Server vs Client Components

Prefer Server Components by default.  
Only mark a component `"use client"` when it truly needs client-side features (hooks, event handlers, browser APIs).  
Isolate that client logic into the smallest possible leaf component and keep the parent as a Server Component.

Layouts and their server-rendered shells must never fetch data or sessions. Reading cookies for UI preferences is allowed. Load sidebar user and Tenant information in client leaf components. Run route authorization guards in `page.tsx`; Server Actions and API endpoints must still authorize their own operations.

## Confirming logout and destructive actions

Every user-initiated logout, deletion, removal, or access revocation (including invitation cancellation) must use `useConfirm` from `@/providers/confirm-provider` before running the operation. Use `SignOutButton` for logout in headers and sidebars.

`ConfirmProvider` is mounted once in `app/(protected)/layout.tsx`, covering both the dashboard and admin area.

Call `confirm({ title, message, action })` from the trigger's event handler. Write the title and message in Brazilian Portuguese, identify the affected item or person, and explain the consequence. Pass the operation as the `action` callback so it runs only after confirmation. Use `type="button"` on triggers to prevent accidental form submission.

The provider owns pending state, disables confirmation and cancellation while the action runs, and closes when it settles. Callers must return or await asynchronous work in `action`. Do not add local dialog/pending state, browser `window.confirm`, or forms that execute destructive actions immediately. Server-side authorization remains required.

Examples: `components/app-shell/sign-out-button.tsx`, `components/dashboard/remove-member-button.tsx`, and `components/dashboard/cancel-invitation-button.tsx`.
