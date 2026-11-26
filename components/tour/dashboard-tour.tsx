"use client";

import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useTheme } from "next-themes";
import { useEffect, useEffectEvent, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import type { MemberRole } from "@/modules/tenancy";
import { tourSteps, useMemberTour, type TourStep } from "@/modules/tenancy/hooks";
import { useTour } from "@/providers/tour-provider";

// A step waits for the mobile panel to finish sliding (200ms) before measuring.
const panelSlideMs = 300;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The Tour, on the overview: a Member who has not seen it gets it once the
// page has loaded, and "Ver tour" replays it. Skipping, closing, Esc and
// finishing all mark it seen, once: a later replay keeps the first time.
// Leaving the page partway does not. While it runs the sidebar is fully open, and it is put
// back as it was afterwards.
export function DashboardTour({ role }: { role: MemberRole }) {
  const member = useMemberTour();
  const { replayRequested, clearReplay, setRunning } = useTour();
  const sidebar = useSidebar();
  const { resolvedTheme } = useTheme();
  const active = useRef<Driver | null>(null);
  const autoStarted = useRef(false);
  const leaving = useRef(false);

  const start = useEffectEvent(() => {
    if (active.current) return;
    const firstTime = !member.seen;
    const steps = tourSteps({ role, botLive: member.botLive });
    const { isMobile, open, openMobile, setOpen, setOpenMobile, setKeepMobileOpen } = sidebar;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let panelOpen = openMobile;
    let moving = false;

    // On a phone the sidebar is a panel over the page: out for the steps in
    // it, away for the header and the rail.
    const showPanelFor = async (step: TourStep) => {
      if (!isMobile || panelOpen === step.inSidebar) return;
      panelOpen = step.inSidebar;
      setOpenMobile(panelOpen);
      if (!reducedMotion) await wait(panelSlideMs);
    };
    const moveTo = async (tour: Driver, index: number) => {
      if (moving) return;
      moving = true;
      await showPanelFor(steps[index]);
      moving = false;
      if (tour.isActive()) tour.moveTo(index);
    };

    const tour = driver({
      steps: steps.map((step, index) => ({
        element: step.target ? `[data-tour="${step.target}"]` : undefined,
        popover: {
          title: step.title,
          description: step.description,
          ...(index === 0 && { nextBtnText: "Começar", showButtons: ["next", "close"] }),
        },
      })),
      animate: !reducedMotion,
      smoothScroll: !reducedMotion,
      overlayColor: "#000",
      overlayOpacity: resolvedTheme === "dark" ? 0.8 : 0.65,
      overlayClickBehavior: "none",
      disableActiveInteraction: true,
      allowClose: true,
      focus: "popover",
      stagePadding: 4,
      stageRadius: 8,
      popoverClass: "dashboard-tour",
      showButtons: ["next", "previous", "close"],
      showProgress: true,
      progressText: "Passo {{current}} de {{total}}",
      nextBtnText: "Próximo",
      prevBtnText: "Voltar",
      doneBtnText: "Concluir",
      closeBtnLabel: "Fechar o tour",
      onPopoverRender: (popover, { driver: current }) => {
        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "driver-popover-skip-btn";
        skip.textContent = "Pular tour";
        skip.addEventListener("click", () => current.destroy());
        popover.footerButtons.prepend(skip);
      },
      onNextClick: (_element, _step, { driver: current }) => {
        if (!current.hasNextStep()) return current.destroy();
        void moveTo(current, (current.getActiveIndex() ?? 0) + 1);
      },
      onPrevClick: (_element, _step, { driver: current }) => {
        if (current.hasPreviousStep()) void moveTo(current, (current.getActiveIndex() ?? 0) - 1);
      },
      onDestroyed: () => {
        active.current = null;
        if (firstTime && !leaving.current) member.markSeen();
        if (isMobile) {
          setKeepMobileOpen(false);
          setOpenMobile(openMobile);
        } else if (!open) setOpen(false);
        setRunning(false);
      },
    });

    active.current = tour;
    setRunning(true);
    if (isMobile) {
      setKeepMobileOpen(true);
      void showPanelFor(steps[0]);
    } else if (!open) setOpen(true);
    // The welcome is attached to nothing, so the sidebar settles behind it.
    tour.drive();
  });

  useEffect(() => {
    leaving.current = false;
    return () => {
      // Leaving partway does not count as seen: the Tour opens again next time.
      leaving.current = true;
      autoStarted.current = false;
      active.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!member.ready) return;
    if (replayRequested) {
      clearReplay();
      start();
    } else if (!member.seen && !autoStarted.current) {
      autoStarted.current = true;
      start();
    }
  }, [member.ready, member.seen, replayRequested, clearReplay]);

  return null;
}
