import type { Metadata } from "next";
import { Suspense } from "react";
import { ContentSkeleton } from "@/components/app-shell/content-skeleton";
import { AuthCard } from "@/components/onboarding/auth-card";
import { ResetPasswordForm } from "@/components/onboarding/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Redefinir senha"
      description="Crie uma nova senha para entrar no painel. Por segurança, você será desconectado(a) dos outros dispositivos."
    >
      {/* The form reads the reset token from the URL, which is request data. */}
      <Suspense fallback={<ContentSkeleton />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
