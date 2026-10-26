import { ShieldCheckIcon } from "lucide-react";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { SidebarUser } from "@/components/app-shell/sidebar-user";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AdminSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div
          className="flex h-12 min-w-0 items-center gap-2 overflow-hidden px-2"
          title="Administração"
        >
          <ShieldCheckIcon className="size-4 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">Administração</span>
            <span className="truncate text-xs text-muted-foreground">ClickStudio Bots</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <AdminNavigation />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUser />
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle inSidebar />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SignOutButton inSidebar />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
