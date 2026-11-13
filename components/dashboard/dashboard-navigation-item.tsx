"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

type DashboardNavigationItemProps = {
  href: string;
  label: string;
  // Overrides the match on the current path, as for a group's first page.
  active?: boolean;
  children: ReactNode;
};

export function DashboardNavigationItem({
  href,
  label,
  active,
  children,
}: DashboardNavigationItemProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isActive =
    active ?? (pathname === href || (href !== "/painel" && pathname.startsWith(`${href}/`)));
  const closeMobileSidebar = () => setOpenMobile(false);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={href} />}
        isActive={isActive}
        aria-current={isActive ? "page" : undefined}
        aria-label={label}
        tooltip={label}
        onClick={closeMobileSidebar}
      >
        {children}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
