import type { ReactNode } from "react";

type DashboardPageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function DashboardPageHeader({ title, description, actions }: DashboardPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <div className="flex max-w-2xl flex-col gap-1 text-sm text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="ml-auto shrink-0">{actions}</div>}
    </div>
  );
}
