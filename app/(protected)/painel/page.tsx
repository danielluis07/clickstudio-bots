import type { Metadata } from "next";
// PROTOTYPE (throwaway): was TenantOverview; restore it when a variant wins.
import { OverviewPrototype } from "@/components/overview/prototype/overview-prototype";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Painel",
  robots: { index: false },
};

export default async function DashboardPage() {
  const scope = await requireTenantScope();

  return <OverviewPrototype scope={scope} />;
}
