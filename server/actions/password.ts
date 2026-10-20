"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, type FormState } from "@/server/actions/form-state";
import { auth } from "@/server/auth/auth";
import { passwordResetDoneParam, signInPath } from "@/server/auth/redirects";

export async function requestPasswordResetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await auth.api.requestPasswordReset({
      body: { email: formText(formData, "email").trim().toLowerCase() },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error)) {
      return { status: "error", message: "Informe um e-mail válido." };
    }
    throw error;
  }
  // The same answer whether or not the address has an account.
  return {
    status: "success",
    message:
      "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira sua caixa de entrada.",
  };
}

export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const newPassword = formText(formData, "password");
  // Better Auth's default email/password length limits.
  if (newPassword.length < 8 || newPassword.length > 128) {
    return {
      status: "error",
      message: "Use uma senha com 8 a 128 caracteres.",
    };
  }
  if (formText(formData, "passwordConfirmation") !== newPassword) {
    return { status: "error", message: "As senhas não conferem." };
  }

  try {
    await auth.api.resetPassword({
      body: { token: formText(formData, "token"), newPassword },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error)) {
      return {
        status: "error",
        message: "Este link é inválido ou expirou. Peça um novo link para redefinir a senha.",
      };
    }
    throw error;
  }
  redirect(`${signInPath}?${passwordResetDoneParam}=1`);
}
