import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { DashboardSidebarTenant } from "@/components/dashboard/dashboard-sidebar-tenant";
import { TourReplayButton } from "@/components/tour/tour-replay-button";
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
        <SidebarMenu>
          <SidebarMenuItem>
            <TourReplayButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SignOutButton inSidebar />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
