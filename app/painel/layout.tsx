import { AppShell } from "@/components/app-shell/app-shell";

export default function DashboardLayout({ children }: LayoutProps<"/painel">) {
  return <AppShell homeHref="/painel">{children}</AppShell>;
}
