import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardPageHeaderProps = {
  title: string;
  titleHidden: boolean;
  description?: ReactNode;
  actions?: ReactNode;
};

export function DashboardPageHeader({
  title,
  titleHidden,
  description,
  actions,
}: DashboardPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className={cn("flex min-w-0 flex-col gap-2", titleHidden && "sr-only")}>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <div className="flex flex-col gap-1 text-muted-foreground">{description}</div>
        )}
      </div>
      {actions && <div className="ml-auto shrink-0">{actions}</div>}
    </div>
  );
}
