"use server";

import { formText, type FormState } from "@/server/actions/form-state";
import { requireAuth } from "@/server/auth/guards";
import { tenantOnboarding } from "@/server/services";

const errorMessages = {
  forbidden: "Você não tem permissão para criar negócios.",
  invalid: "Informe o nome do negócio e um e-mail válido para o responsável.",
} as const;

export async function createTenantAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user } = await requireAuth();

  // The onboarding module re-checks that the actor is a platform administrator.
  const result = await tenantOnboarding.createTenant(user.id, {
    tenantName: formText(formData, "tenantName"),
    ownerEmail: formText(formData, "ownerEmail"),
  });

  if (!result.ok) {
    return { status: "error", message: errorMessages[result.error] };
  }
  if (!result.emailSent) {
    return {
      status: "error",
      message: `O negócio foi criado, mas o e-mail não foi enviado. Envie este link ao responsável: ${result.invitationUrl}`,
    };
  }
  return {
    status: "success",
    message: `Negócio criado. O convite foi enviado para ${result.ownerEmail}.`,
  };
}
