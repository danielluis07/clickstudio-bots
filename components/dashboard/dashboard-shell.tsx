import { DashboardHeaderActions } from "@/components/app-shell/dashboard-header-actions";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ChannelStatus } from "@/components/channels/channel-status";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Only the sidebar preference depends on the request here. Pages authorize
// their own reads; sidebar identity data loads in client components.
export async function DashboardShell({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <DashboardSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
          <SidebarTrigger />
          <span className="shrink-0 text-sm text-muted-foreground">Painel</span>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
            <ChannelStatus />
            <DashboardHeaderActions />
          </div>
        </header>
        <div className="min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
