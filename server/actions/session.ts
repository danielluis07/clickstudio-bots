"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, type FormState } from "@/server/actions/form-state";
import { auth } from "@/server/auth/auth";
import { returnToParam, safeReturnPath, signedInHomePath, signInPath } from "@/server/auth/redirects";

export async function signInAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let destination = signedInHomePath;
  try {
    const { user } = await auth.api.signInEmail({
      body: {
        email: formText(formData, "email").trim(),
        password: formText(formData, "password"),
      },
      headers: await headers(),
    });
    destination = safeReturnPath(formText(formData, returnToParam), user.role);
  } catch (error) {
    if (isAPIError(error)) {
      return { status: "error", message: "E-mail ou senha incorretos." };
    }
    throw error;
  }
  redirect(destination);
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect(signInPath);
}
