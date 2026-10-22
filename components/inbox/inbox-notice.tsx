import type { ReactNode } from "react";

export function InboxNotice({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <p
      role={alert ? "alert" : undefined}
      className="m-auto max-w-xs p-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </p>
  );
}
