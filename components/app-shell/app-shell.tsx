import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/app-header";

export function AppShell({ homeHref, children }: { homeHref: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader homeHref={homeHref} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
