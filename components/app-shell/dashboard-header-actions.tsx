import { SidebarUser } from "@/components/app-shell/sidebar-user";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";

export function DashboardHeaderActions() {
  return (
    <div className="ml-auto flex min-w-0 items-center gap-4">
      <div className="shrink-0">
        <ThemeToggle />
      </div>
      <SidebarUser />
    </div>
  );
}
