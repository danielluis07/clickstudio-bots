import { Building2Icon, UserRoundIcon } from "lucide-react";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type DashboardSidebarProps = {
  tenantName: string;
  memberName: string;
  memberEmail: string;
};

export function DashboardSidebar({
  tenantName,
  memberName,
  memberEmail,
}: DashboardSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div
          className="flex h-12 min-w-0 items-center gap-2 overflow-hidden px-2"
          title={tenantName}>
          <Building2Icon className="size-4 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">{tenantName}</span>
            <span className="truncate text-xs text-muted-foreground">
              ClickStudio Bots
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <DashboardNavigation />
      </SidebarContent>
      <SidebarFooter>
        <div
          className="flex min-w-0 items-center gap-2 overflow-hidden p-2"
          title={`${memberName} (${memberEmail})`}>
          <UserRoundIcon className="size-4 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{memberName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {memberEmail}
            </span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SignOutButton inSidebar />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
