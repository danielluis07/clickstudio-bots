import type { ReactNode } from "react";

// A settings field with its label on the left on wide screens and above it on
// narrow ones. A description gets the id `${htmlFor}-description`.
export function FormRow({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <label htmlFor={htmlFor} className="text-sm text-muted-foreground sm:pt-2">
        {label}
      </label>
      <div className="flex min-w-0 flex-col gap-1.5">
        {children}
        {description && (
          <p id={`${htmlFor}-description`} className="text-xs text-muted-foreground tabular-nums">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
