import { useId, type ReactNode } from "react";
import type { TourTargetId } from "@/modules/tenancy/hooks";

// One titled block of a DashboardPage rail, split from the next by a rule.
export function DashboardRailSection({
  title,
  aside,
  tour,
  children,
}: {
  title: string;
  // A short figure beside the title, like "3 de 5".
  aside?: ReactNode;
  // The `data-tour` name the Tour highlights the section by.
  tour?: TourTargetId;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-tour={tour}
      className="flex flex-col gap-3 border-b px-5 py-5 last:border-b-0"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {aside && <span className="text-xs text-muted-foreground tabular-nums">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
