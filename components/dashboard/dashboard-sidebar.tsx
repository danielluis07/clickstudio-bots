import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { SidebarUser } from "@/components/app-shell/sidebar-user";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { DashboardSidebarTenant } from "@/components/dashboard/dashboard-sidebar-tenant";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function DashboardSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <DashboardSidebarTenant />
      </SidebarHeader>
      <SidebarContent>
        <DashboardNavigation />
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
