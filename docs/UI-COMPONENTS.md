## Shadcn UI

Shadcn is the foundation for the design in this project. Tailwind for styling

## File placement

`components/` holds only `.tsx` files for UI. Domain-specific hooks and supporting browser logic belong in `modules/<area>/hooks/`, exposed through `@/modules/<area>/hooks`. Keep that entry point browser-safe and pass Server Actions into hooks from components.

## Server vs Client Components

Prefer Server Components by default.  
Only mark a component `"use client"` when it truly needs client-side features (hooks, event handlers, browser APIs).  
Isolate that client logic into the smallest possible leaf component and keep the parent as a Server Component.
