import type { ReactNode } from "react";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { cn } from "@/lib/utils";

type DashboardPageProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  // "full" for lists, tables and dashboards; "form" caps the width so fields
  // and text stay readable.
  width?: "full" | "form";
  // A right-hand column for what sits beside the work: status, allowance,
  // a live preview. Turns the page into two full-height panes.
  rail?: ReactNode;
  // The rail's accessible name.
  railLabel?: string;
  children: ReactNode;
};

// Every /painel page starts at the same left edge and top, with the same
// spacing. Documented in docs/UI-COMPONENTS.md.
export function DashboardPage({
  title,
  description,
  actions,
  width = "full",
  rail,
  railLabel,
  children,
}: DashboardPageProps) {
  const main = (
    <div className={cn("flex w-full min-w-0 flex-col gap-5", width === "form" && "max-w-3xl")}>
      <DashboardPageHeader title={title} description={description} actions={actions} />
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
  if (!rail) return main;

  // Cancels the shell's padding so both panes reach its edges.
  return (
    <div className="-mx-4 -my-8 flex min-h-[calc(100svh-3.5rem)] flex-col sm:-mx-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-6">{main}</div>
      <aside
        aria-label={railLabel}
        className="flex w-full shrink-0 flex-col border-t bg-muted/30 lg:w-80 lg:border-t-0 lg:border-l xl:w-96"
      >
        {rail}
      </aside>
    </div>
  );
}
