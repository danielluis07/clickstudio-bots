"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, type FormState } from "@/server/actions/form-state";
import { auth } from "@/server/auth/auth";
import { tenantOnboarding } from "@/server/services";

const errorMessages = {
  terms_required: "Para continuar, aceite os Termos de Uso e o DPA.",
  unavailable:
    "Este convite não está mais disponível. Peça um novo convite a quem convidou você.",
  invalid: "Informe seu nome e uma senha com pelo menos 8 caracteres.",
  wrong_password: "Senha incorreta para a conta que já usa este e-mail.",
} as const;

export async function acceptInvitationAction(
  invitationId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = formText(formData, "password");
  if (
    formData.has("passwordConfirmation") &&
    formText(formData, "passwordConfirmation") !== password
  ) {
    return { status: "error", message: "As senhas não conferem." };
  }

  const result = await tenantOnboarding.acceptInvitation({
    invitationId,
    acceptedTerms: formData.get("acceptedTerms") === "on",
    name: formText(formData, "name"),
    password,
  });
  if (!result.ok) {
    return { status: "error", message: errorMessages[result.error] };
  }

  await auth.api.signInEmail({
    body: { email: result.email, password },
    headers: await headers(),
  });
  redirect("/painel");
}
