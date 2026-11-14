import type { Metadata } from "next";
import { AuthCard } from "@/components/onboarding/auth-card";
import { SignInForm } from "@/components/onboarding/sign-in-form";
import { redirectIfSignedIn } from "@/server/auth/guards";
import { returnToParam } from "@/server/auth/redirects";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel do seu negócio no ClickStudio Bots.",
};

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const returnTo = (await searchParams)[returnToParam];
  await redirectIfSignedIn(typeof returnTo === "string" ? returnTo : null);

  return (
    <AuthCard
      title="Entrar"
      description="Acesse o painel com o e-mail e a senha definidos ao aceitar o convite."
    >
      <SignInForm />
    </AuthCard>
  );
}
