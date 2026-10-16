## Shadcn UI

Shadcn is the foundation for the design in this project

## Server vs Client Components

Prefer Server Components by default.  
Only mark a component `"use client"` when it truly needs client-side features (hooks, event handlers, browser APIs).  
Isolate that client logic into the smallest possible leaf component and keep the parent as a Server Component.
