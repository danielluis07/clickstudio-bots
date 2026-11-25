"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, type FormState } from "@/server/actions/form-state";
import { passwordConfirmationError } from "@/modules/tenancy";
import { auth } from "@/server/auth/auth";
import {
  signInAlreadyCounted,
  signInClientIp,
  tooManySignInAttemptsMessage,
} from "@/server/auth/sign-in-limit";
import { tenantOnboarding } from "@/server/services";

const errorMessages = {
  terms_required: "Para continuar, aceite os Termos de Uso e o DPA.",
  unavailable: "Este convite não está mais disponível. Peça um novo convite a quem convidou você.",
  invalid: "Informe seu nome e uma senha com pelo menos 8 caracteres.",
  wrong_password: "Senha incorreta para a conta que já usa este e-mail.",
  too_many_attempts: tooManySignInAttemptsMessage,
} as const;

export async function acceptInvitationAction(
  invitationId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // The form checks this before submitting; checked again here because the
  // browser is not trusted.
  const confirmationError = passwordConfirmationError(formData);
  if (confirmationError) return { status: "error", message: confirmationError };
  const password = formText(formData, "password");
  const requestHeaders = await headers();

  const result = await tenantOnboarding.acceptInvitation({
    invitationId,
    acceptedTerms: formData.get("acceptedTerms") === "on",
    name: formText(formData, "name"),
    password,
    clientIp: signInClientIp(requestHeaders, auth.options),
  });
  if (!result.ok) {
    return { status: "error", message: errorMessages[result.error] };
  }

  // An existing account's password check already counted toward the limit,
  // and a new account's password was just set by this request.
  await signInAlreadyCounted(() =>
    auth.api.signInEmail({
      body: { email: result.email, password },
      headers: requestHeaders,
    }),
  );
  redirect("/painel");
}
