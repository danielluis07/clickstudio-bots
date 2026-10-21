import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardShellSkeleton } from "@/components/dashboard/dashboard-shell-skeleton";
import { TRPCReactProvider } from "@/trpc/client";

export default function DashboardLayout({ children }: LayoutProps<"/painel">) {
  return (
    <TRPCReactProvider>
      <Suspense fallback={<DashboardShellSkeleton />}>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </TRPCReactProvider>
  );
}
