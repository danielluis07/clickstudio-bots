import type { ReactNode } from "react";
import { Empty, EmptyDescription } from "@/components/ui/empty";

// A chart's place while the period has nothing to show yet.
export function OverviewEmpty({ children, className }: { children: ReactNode; className: string }) {
  return (
    <Empty className={className}>
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}
