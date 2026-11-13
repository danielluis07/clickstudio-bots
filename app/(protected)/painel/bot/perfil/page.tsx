import type { Metadata } from "next";
// PROTOTYPE (throwaway): was BusinessProfileEditor; restore it when a variant wins.
import { ProfilePrototype } from "@/components/bot/prototype/profile-prototype";
import { requireTenantScope } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Perfil do negócio",
  robots: { index: false },
};

export default async function BusinessProfilePage() {
  const scope = await requireTenantScope();

  return <ProfilePrototype scope={scope} />;
}
