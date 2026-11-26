"use client";

import { CompassIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { useTour } from "@/providers/tour-provider";

// "Ver tour": replays the Tour from any page. It runs on the overview, so
// elsewhere this goes there first. Replaying keeps the time the Member first
// saw it.
export function TourReplayButton() {
  const { requestReplay } = useTour();
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

  function replay() {
    setOpenMobile(false);
    requestReplay();
    if (pathname !== "/painel") router.push("/painel");
  }

  return (
    <SidebarMenuButton
      type="button"
      tooltip="Ver tour"
      aria-label="Ver tour"
      data-tour="replay"
      onClick={replay}
    >
      <CompassIcon aria-hidden="true" />
      <span>Ver tour</span>
    </SidebarMenuButton>
  );
}
