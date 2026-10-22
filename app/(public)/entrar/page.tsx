import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentSkeleton } from "@/components/app-shell/content-skeleton";
import { AuthCard } from "@/components/onboarding/auth-card";
import { SignInForm } from "@/components/onboarding/sign-in-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel do seu negócio no ClickStudio Bots.",
};

export default function SignInPage() {
  return (
    <AuthCard
      title="Entrar"
      description="Acesse o painel com o e-mail e a senha definidos ao aceitar o convite."
    >
      {/* The form reads the return path from the URL, which is request data. */}
      <Suspense fallback={<ContentSkeleton />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
