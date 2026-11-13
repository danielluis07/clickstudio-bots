import type { ReactNode } from "react";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { cn } from "@/lib/utils";

type DashboardPageProps = {
  title: string;
  // Still the page's heading for assistive technology, but not shown.
  titleHidden?: boolean;
  description?: ReactNode;
  actions?: ReactNode;
  // "full" for lists, tables and dashboards; "form" caps the width so fields
  // and text stay readable.
  width?: "full" | "form";
  children: ReactNode;
};

// Every /painel page starts at the same left edge and top, with the same
// spacing. Documented in docs/UI-COMPONENTS.md.
export function DashboardPage({
  title,
  titleHidden = false,
  description,
  actions,
  width = "full",
  children,
}: DashboardPageProps) {
  return (
    <div className={cn("flex w-full flex-col gap-6", width === "form" && "max-w-3xl")}>
      <DashboardPageHeader
        title={title}
        titleHidden={titleHidden}
        description={description}
        actions={actions}
      />
      <div className="flex flex-col gap-8">{children}</div>
    </div>
  );
}
