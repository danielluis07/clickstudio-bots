"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";

// Icons and labels switch through the `dark:` variant so the server render
// matches the client before the stored theme is known.
export function ThemeToggle({ inSidebar = false }: { inSidebar?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();

  function handleToggle() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  if (inSidebar) {
    return (
      <SidebarMenuButton
        type="button"
        tooltip="Alternar tema"
        aria-label="Alternar tema"
        onClick={handleToggle}
      >
        <MoonIcon aria-hidden="true" className="dark:hidden" />
        <SunIcon aria-hidden="true" className="hidden dark:block" />
        <span className="dark:hidden">Tema escuro</span>
        <span className="hidden dark:inline">Tema claro</span>
      </SidebarMenuButton>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Alternar tema"
      onClick={handleToggle}
    >
      <MoonIcon aria-hidden="true" className="dark:hidden" />
      <SunIcon aria-hidden="true" className="hidden dark:block" />
    </Button>
  );
}
