import type { Metadata } from "next";
import { AuthCard } from "@/components/onboarding/auth-card";
import { SignInForm } from "@/components/onboarding/sign-in-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel do seu negócio no ClickStudio Bots.",
};

export default function SignInPage() {
  return (
    <AuthCard title="Entrar" description="Acesse o painel com o e-mail e a senha definidos ao aceitar o convite.">
      <SignInForm />
    </AuthCard>
  );
}
