## Shadcn UI

Shadcn is the foundation for the design in this project. Tailwind for styling

## File placement

See [code conventions](CONVENTIONS.md#layout) for file placement, module boundaries, and hook dependencies.

## Server vs Client Components

Prefer Server Components by default.  
Only mark a component `"use client"` when it truly needs client-side features (hooks, event handlers, browser APIs).  
Isolate that client logic into the smallest possible leaf component and keep the parent as a Server Component.

## Confirming logout and destructive actions

Every user-initiated logout, deletion, removal, or access revocation (including invitation cancellation) must use `useConfirm` from `@/providers/confirm-provider` before running the operation. Use `SignOutButton` for logout in headers and sidebars.

`ConfirmProvider` is mounted once in `app/(protected)/layout.tsx`, covering both the dashboard and admin area.

Call `confirm({ title, message, action })` from the trigger's event handler. Write the title and message in Brazilian Portuguese, identify the affected item or person, and explain the consequence. Pass the operation as the `action` callback so it runs only after confirmation. Use `type="button"` on triggers to prevent accidental form submission.

The provider owns pending state, disables confirmation and cancellation while the action runs, and closes when it settles. Callers must return or await asynchronous work in `action`. Do not add local dialog/pending state, browser `window.confirm`, or forms that execute destructive actions immediately. Server-side authorization remains required.

Examples: `components/app-shell/sign-out-button.tsx`, `components/dashboard/remove-member-button.tsx`, and `components/dashboard/cancel-invitation-button.tsx`.
