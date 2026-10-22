"use client";

import { Building2Icon, CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AdminNavigation() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isActive = pathname === "/admin";
  const closeMobileSidebar = () => setOpenMobile(false);

  return (
    <SidebarGroup>
      <nav aria-label="Navegação da administração">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/admin" />}
              isActive={isActive}
              aria-current={isActive ? "page" : undefined}
              aria-label="Negócios"
              tooltip="Negócios"
              onClick={closeMobileSidebar}
            >
              <Building2Icon aria-hidden="true" />
              <span>Negócios</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/admin/eventos" />}
              isActive={pathname === "/admin/eventos"}
              aria-current={pathname === "/admin/eventos" ? "page" : undefined}
              aria-label="Eventos com falha"
              tooltip="Eventos com falha"
              onClick={closeMobileSidebar}
            >
              <CircleAlertIcon aria-hidden="true" />
              <span>Eventos com falha</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </nav>
    </SidebarGroup>
  );
}
