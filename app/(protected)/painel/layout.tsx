import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardShellSkeleton } from "@/components/dashboard/dashboard-shell-skeleton";
import { ConfirmProvider } from "@/providers/confirm-provider";
import { TRPCReactProvider } from "@/trpc/client";

export default function DashboardLayout({ children }: LayoutProps<"/painel">) {
  return (
    <TRPCReactProvider>
      <ConfirmProvider>
        <Suspense fallback={<DashboardShellSkeleton />}>
          <DashboardShell>{children}</DashboardShell>
        </Suspense>
      </ConfirmProvider>
    </TRPCReactProvider>
  );
}
