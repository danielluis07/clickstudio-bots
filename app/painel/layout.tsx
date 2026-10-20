import { AppShell } from "@/components/app-shell/app-shell";
import { ConfirmProvider } from "@/providers/confirm-provider";

export default function DashboardLayout({ children }: LayoutProps<"/painel">) {
  return (
    <ConfirmProvider>
      <AppShell homeHref="/painel">{children}</AppShell>
    </ConfirmProvider>
  );
}
