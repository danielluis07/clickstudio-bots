import type { Metadata } from "next";
import { BusinessProfileEditor } from "@/components/bot/business-profile-editor";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Perfil do negócio",
  robots: { index: false },
};

export default async function BusinessProfilePage() {
  const scope = await requireTenantScope();

  return <BusinessProfileEditor scope={scope} />;
}
