## Shadcn UI

Shadcn is the foundation for the design in this project. Tailwind for styling

## Live client data

Call the domain hooks exposed by `@/modules/<area>/hooks` from components. Hooks own tRPC access, query keys, invalidation and transport error parsing; UI receives domain data, state and callbacks. Do not import `useTRPC` into components or derive their props from generated router types. Import domain types through the module's public interface. Server Actions for other forms continue to be passed as callbacks.

## File placement

`components/` holds only `.tsx` files for UI. Domain-specific hooks and supporting browser logic belong in `modules/<area>/hooks/`, exposed through `@/modules/<area>/hooks`. Keep that entry point browser-safe and pass Server Actions into hooks from components.

## Server vs Client Components

Prefer Server Components by default.  
Only mark a component `"use client"` when it truly needs client-side features (hooks, event handlers, browser APIs).  
Isolate that client logic into the smallest possible leaf component and keep the parent as a Server Component.
