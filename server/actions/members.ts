"use server";

import { refresh } from "next/cache";
import { memberAllowance } from "@/modules/tenancy";
import { formText, type FormState } from "@/server/actions/form-state";
import { requireTenantScope } from "@/server/auth/guards";
import { memberManagement } from "@/server/services";

const inviteErrorMessages = {
  forbidden: "Apenas o responsável pelo negócio pode convidar membros.",
  invalid: "Informe um e-mail válido.",
  already_member: "Essa pessoa já faz parte da equipe.",
  allowance_reached: `O plano inclui até ${memberAllowance} membros, contando os convites pendentes. Remova um membro ou cancele um convite para convidar outra pessoa.`,
} as const;

// The tenancy module re-checks that the actor is the Tenant's owner.

export async function inviteMemberAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const scope = await requireTenantScope();

  const result = await memberManagement.inviteMember(scope, {
    email: formText(formData, "email"),
  });
  if (!result.ok) {
    return { status: "error", message: inviteErrorMessages[result.error] };
  }

  refresh();
  if (!result.emailSent) {
    return {
      status: "error",
      message: `O convite foi criado, mas o e-mail não foi enviado. Envie este link para ${result.email}: ${result.invitationUrl}`,
    };
  }
  return {
    status: "success",
    message: `Convite enviado para ${result.email}.`,
  };
}

export async function removeMemberAction(memberId: string) {
  const scope = await requireTenantScope();
  await memberManagement.removeMember(scope, memberId);
  refresh();
}

export async function cancelInvitationAction(invitationId: string) {
  const scope = await requireTenantScope();
  await memberManagement.cancelInvitation(scope, invitationId);
  refresh();
}
