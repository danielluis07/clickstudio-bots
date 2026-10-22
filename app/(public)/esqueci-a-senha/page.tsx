import type { Metadata } from "next";
import { AuthCard } from "@/components/onboarding/auth-card";
import { ForgotPasswordForm } from "@/components/onboarding/forgot-password-form";

export const metadata: Metadata = {
  title: "Esqueci minha senha",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
