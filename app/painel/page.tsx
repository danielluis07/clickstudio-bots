import type { Metadata } from "next";
import { TenantOverview } from "@/components/dashboard/tenant-overview";
import { requireTenantScope } from "@/lib/auth-guards";

export const metadata: Metadata = {
  title: "Painel",
  robots: { index: false },
};

export default async function DashboardPage() {
  const scope = await requireTenantScope();

  return <TenantOverview scope={scope} />;
}
