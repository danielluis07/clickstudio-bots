"use client";

import { Building2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

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
              onClick={closeMobileSidebar}>
              <Building2Icon aria-hidden="true" />
              <span>Negócios</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </nav>
    </SidebarGroup>
  );
}
