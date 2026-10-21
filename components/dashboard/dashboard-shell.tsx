import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { db } from "@/db";
import { createTenantRepository } from "@/modules/tenancy";
import { requireAuth, requireTenantScope } from "@/server/auth/guards";

// The layout renders this under Suspense: both the session and the sidebar
// preference depend on the request. Pages still authorize their own reads.
export async function DashboardShell({ children }: { children: ReactNode }) {
  const [cookieStore, scope, { user }] = await Promise.all([
    cookies(),
    requireTenantScope(),
    requireAuth(),
  ]);
  const tenant = await createTenantRepository(db, scope).getTenant();

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <DashboardSidebar tenantName={tenant?.name ?? "Seu negócio"} memberName={user.name} memberEmail={user.email} />
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">Painel</span>
        </header>
        <div className="min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
