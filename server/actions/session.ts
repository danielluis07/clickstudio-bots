"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, type FormState } from "@/server/actions/form-state";
import { auth } from "@/server/auth/auth";
import {
  tooManySignInAttemptsCode,
  tooManySignInAttemptsMessage,
} from "@/server/auth/sign-in-limit";
import {
  returnToParam,
  safeReturnPath,
  secondFactorChallengePath,
  secondFactorEnrollmentPath,
  signedInHomePath,
  signInPath,
} from "@/server/auth/redirects";

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let destination = signedInHomePath;
  try {
    const result = await auth.api.signInEmail({
      body: {
        email: formText(formData, "email").trim(),
        password: formText(formData, "password"),
      },
      headers: await headers(),
    });
    const returnTo = formText(formData, returnToParam);
    if ("twoFactorRedirect" in result) {
      // No session yet: the two-factor plugin holds the sign-in until a code.
      const challenge = new URLSearchParams(returnTo ? { [returnToParam]: returnTo } : {});
      destination = `${secondFactorChallengePath}${challenge.size ? `?${challenge}` : ""}`;
    } else if (result.user.role === "admin" && !result.user.twoFactorEnabled) {
      destination = secondFactorEnrollmentPath;
    } else {
      destination = safeReturnPath(returnTo, result.user.role);
    }
  } catch (error) {
    if (isAPIError(error) && error.body?.code === tooManySignInAttemptsCode) {
      return { status: "error", message: tooManySignInAttemptsMessage };
    }
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
