import { AppShell } from "@/components/app-shell/app-shell";
import { ConfirmProvider } from "@/providers/confirm-provider";
import { TRPCReactProvider } from "@/trpc/client";

export default function DashboardLayout({ children }: LayoutProps<"/painel">) {
  return (
    <TRPCReactProvider>
      <ConfirmProvider>
        <AppShell homeHref="/painel">{children}</AppShell>
      </ConfirmProvider>
    </TRPCReactProvider>
  );
}
