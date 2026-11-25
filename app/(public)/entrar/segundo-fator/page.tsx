import type { Metadata } from "next";
import { AuthCard } from "@/components/onboarding/auth-card";
import { SecondFactorSetup } from "@/components/onboarding/second-factor-setup";
import { requireAdminWithoutSecondFactor } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: "Proteja a administração",
  robots: { index: false },
};

export default async function SecondFactorSetupPage() {
  await requireAdminWithoutSecondFactor();

  return (
    <AuthCard
      title="Proteja a administração"
      description="A administração pede, além da senha, um código do aplicativo autenticador no seu celular. Configure-o uma vez para continuar."
    >
      <SecondFactorSetup />
    </AuthCard>
  );
}
