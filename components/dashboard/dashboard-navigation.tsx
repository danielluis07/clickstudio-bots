import { BookOpenIcon, LayoutDashboardIcon, MessagesSquareIcon, SettingsIcon } from "lucide-react";
import { BillingNavigationItem } from "@/components/billing/billing-navigation-item";
import { DashboardBotNavigation } from "@/components/dashboard/dashboard-bot-navigation";
import { DashboardNavigationItem } from "@/components/dashboard/dashboard-navigation-item";
import { SidebarGroup, SidebarMenu } from "@/components/ui/sidebar";

export function DashboardNavigation() {
  return (
    <SidebarGroup>
      <nav aria-label="Navegação do painel">
        <SidebarMenu>
          <DashboardNavigationItem href="/painel" label="Visão geral" tour="nav-overview">
            <LayoutDashboardIcon aria-hidden="true" />
          </DashboardNavigationItem>
          <DashboardNavigationItem
            href="/painel/conversas"
            label="Conversas"
            tour="nav-conversations"
          >
            <MessagesSquareIcon aria-hidden="true" />
          </DashboardNavigationItem>
          <DashboardNavigationItem
            href="/painel/base-de-conhecimento"
            label="Base de conhecimento"
            tour="nav-knowledge-base"
          >
            <BookOpenIcon aria-hidden="true" />
          </DashboardNavigationItem>
          <DashboardBotNavigation />
          <DashboardNavigationItem
            href="/painel/configuracoes"
            label="Configurações"
            tour="nav-settings"
          >
            <SettingsIcon aria-hidden="true" />
          </DashboardNavigationItem>
          <BillingNavigationItem />
        </SidebarMenu>
      </nav>
    </SidebarGroup>
  );
}
