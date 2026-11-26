import type { TourTargetId } from "@/modules/tenancy/hooks";

// An invisible box the Tour highlights in place of several sidebar sub-items
// at once: placed in the first item, it covers `rows` items stacked below one
// another (SidebarMenuSub spaces them by 0.25rem).
export function TourTarget({ id, rows }: { id: TourTargetId; rows: number }) {
  return (
    <span
      aria-hidden="true"
      data-tour={id}
      className="pointer-events-none absolute inset-x-0 top-0"
      style={{ height: `calc(${rows * 100}% + ${(rows - 1) * 0.25}rem)` }}
    />
  );
}
