"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, type FormState } from "@/lib/actions/form-state";
import { auth } from "@/lib/auth";
import { returnToParam, safeReturnPath, signInPath } from "@/lib/auth-redirects";

export async function signInAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await auth.api.signInEmail({
      body: {
        email: formText(formData, "email").trim(),
        password: formText(formData, "password"),
      },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error)) {
      return { status: "error", message: "E-mail ou senha incorretos." };
    }
    throw error;
  }
  redirect(safeReturnPath(formText(formData, returnToParam)));
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect(signInPath);
}
