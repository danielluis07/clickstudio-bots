"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { DashboardNavigationItem } from "@/components/dashboard/dashboard-navigation-item";
import { TourTarget } from "@/components/tour/tour-target";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { TourTargetId } from "@/modules/tenancy/hooks";

type DashboardNavigationGroupProps = {
  // The group's first page, opened from the icon-only sidebar.
  href: string;
  label: string;
  // `tour` is a box the Tour highlights, over `rows` items from this one.
  items: { href: string; label: string; tour?: { id: TourTargetId; rows: number } }[];
  // Shows the pages whatever the Member chose, as while the Tour runs.
  forceOpen?: boolean;
  children: ReactNode;
};

// A sidebar item that opens to list its pages. It opens by itself on any of
// them; elsewhere it stays as the Member left it.
export function DashboardNavigationGroup({
  href,
  label,
  items,
  forceOpen = false,
  children,
}: DashboardNavigationGroupProps) {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const listId = useId();
  const inGroup = pathname === href || pathname.startsWith(`${href}/`);
  const [open, setOpen] = useState(inGroup);
  const [wasInGroup, setWasInGroup] = useState(inGroup);
  if (inGroup !== wasInGroup) {
    setWasInGroup(inGroup);
    if (inGroup) setOpen(true);
  }
  const expanded = open || forceOpen;

  // The icon-only sidebar has no room for the pages, so the icon opens the first.
  if (state === "collapsed" && !isMobile) {
    return (
      <DashboardNavigationItem href={href} label={label} active={inGroup}>
        {children}
      </DashboardNavigationItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={inGroup}
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        onClick={() => setOpen(!open)}
      >
        {children}
        <span>{label}</span>
        <ChevronRightIcon
          aria-hidden="true"
          className={cn("ml-auto transition-transform", expanded && "rotate-90")}
        />
      </SidebarMenuButton>
      {expanded && (
        <SidebarMenuSub id={listId}>
          {items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <SidebarMenuSubItem key={item.href}>
                {item.tour && <TourTarget id={item.tour.id} rows={item.tour.rows} />}
                <SidebarMenuSubButton
                  render={<Link href={item.href} />}
                  isActive={isActive}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setOpenMobile(false)}
                >
                  <span>{item.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
