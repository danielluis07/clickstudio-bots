import { alertCountLabel } from "@/modules/conversations/hooks";

// The unread count on the bell; the bell's name says it to screen readers.
export function AlertCountBadge({ unread }: { unread: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] leading-none font-semibold text-brand-foreground tabular-nums"
    >
      {alertCountLabel(unread)}
    </span>
  );
}
