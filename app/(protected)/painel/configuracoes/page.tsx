import type { Metadata } from "next";
import { TenantSettings } from "@/components/dashboard/tenant-settings";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Configurações",
  robots: { index: false },
};

export default async function SettingsPage() {
  const scope = await requireTenantScope();

  return <TenantSettings scope={scope} />;
}
