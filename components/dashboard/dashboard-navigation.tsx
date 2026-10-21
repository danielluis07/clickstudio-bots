import { BookOpenIcon, LayoutDashboardIcon, MessagesSquareIcon } from "lucide-react";
import { DashboardNavigationItem } from "@/components/dashboard/dashboard-navigation-item";
import { SidebarGroup, SidebarMenu } from "@/components/ui/sidebar";

export function DashboardNavigation() {
  return (
    <SidebarGroup>
      <nav aria-label="Navegação do painel">
        <SidebarMenu>
          <DashboardNavigationItem href="/painel" label="Visão geral">
            <LayoutDashboardIcon aria-hidden="true" />
          </DashboardNavigationItem>
          <DashboardNavigationItem href="/painel/conversas" label="Conversas">
            <MessagesSquareIcon aria-hidden="true" />
          </DashboardNavigationItem>
          <DashboardNavigationItem href="/painel/base-de-conhecimento" label="Base de conhecimento">
            <BookOpenIcon aria-hidden="true" />
          </DashboardNavigationItem>
        </SidebarMenu>
      </nav>
    </SidebarGroup>
  );
}
