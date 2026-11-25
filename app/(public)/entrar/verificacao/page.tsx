import type { Metadata } from "next";
import { AuthCard } from "@/components/onboarding/auth-card";
import { SecondFactorChallengeForm } from "@/components/onboarding/second-factor-challenge-form";
import { returnToParam } from "@/server/auth/redirects";

export const metadata: Metadata = {
  title: "Verificação em duas etapas",
  robots: { index: false },
};

// Reached from the sign-in form once the password is right. The challenge
// lives in a short-lived cookie the sign-in set; the action checks it.
export default async function SecondFactorChallengePage({
  searchParams,
}: PageProps<"/entrar/verificacao">) {
  const returnTo = (await searchParams)[returnToParam];

  return (
    <AuthCard
      title="Verificação em duas etapas"
      description="Digite o código de 6 dígitos do seu aplicativo autenticador."
    >
      <SecondFactorChallengeForm returnTo={typeof returnTo === "string" ? returnTo : ""} />
    </AuthCard>
  );
}
