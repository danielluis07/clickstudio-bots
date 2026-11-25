"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, type FormState } from "@/server/actions/form-state";
import { auth } from "@/server/auth/auth";
import { requireAdminWithoutSecondFactor } from "@/server/auth/guards";
import { adminHomePath, returnToParam, safeReturnPath } from "@/server/auth/redirects";

// The administrator's second factor (#149). Better Auth's two-factor routes are
// off over HTTP (create-auth.ts), so these actions are its only callers.

export type SecondFactorSetup = {
  // otpauth:// link an authenticator app opens; it carries the setup key.
  totpUri: string;
  setupKey: string;
  backupCodes: string[];
};

export type SecondFactorSetupState = FormState | ({ status: "ready" } & SecondFactorSetup);

const errorCode = (error: unknown) => (isAPIError(error) ? error.body?.code : undefined);

// The verify endpoints return the user without its declared type; the platform
// role is in it all the same.
const roleOf = (user: object) =>
  "role" in user && typeof user.role === "string" ? user.role : null;

// The secret in the otpauth:// link, in groups of four for typing it by hand.
const setupKeyOf = (totpUri: string) =>
  (new URL(totpUri).searchParams.get("secret") ?? "").match(/.{1,4}/g)?.join(" ") ?? "";

// Step 1: the password again, then a fresh TOTP secret and backup codes.
// Running it again before step 2 replaces both.
export async function startSecondFactorSetupAction(
  _previous: SecondFactorSetupState,
  formData: FormData,
): Promise<SecondFactorSetupState> {
  await requireAdminWithoutSecondFactor();
  try {
    const enrollment = await auth.api.enableTwoFactor({
      body: { password: formText(formData, "password"), method: "totp" },
      headers: await headers(),
    });
    if (enrollment.method !== "totp") throw new Error("TOTP enrollment returned no secret");
    const { totpURI, backupCodes } = enrollment;
    return { status: "ready", totpUri: totpURI, setupKey: setupKeyOf(totpURI), backupCodes };
  } catch (error) {
    if (errorCode(error) === "INVALID_PASSWORD") {
      return { status: "error", message: "Senha incorreta." };
    }
    throw error;
  }
}

// Step 2: the first code from the app turns the second factor on.
export async function confirmSecondFactorSetupAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdminWithoutSecondFactor();
  const requestHeaders = await headers();
  // Sessions opened with the password alone, before this setup, would keep
  // working after it. End them first; this one is replaced on success.
  await auth.api.revokeOtherSessions({ headers: requestHeaders });
  try {
    await auth.api.verifyTOTP({
      body: { code: formText(formData, "code").replace(/\s/g, "") },
      headers: requestHeaders,
    });
  } catch (error) {
    if (errorCode(error) === "INVALID_CODE") {
      return {
        status: "error",
        message: "Código incorreto. Confira se o horário do celular está certo e tente de novo.",
      };
    }
    throw error;
  }
  redirect(adminHomePath);
}

const challengeRefusals: Record<string, string> = {
  INVALID_CODE: "Código incorreto.",
  INVALID_BACKUP_CODE: "Código incorreto.",
  INVALID_TWO_FACTOR_COOKIE: "A verificação expirou. Entre novamente com seu e-mail e senha.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    "Muitas tentativas incorretas. Entre novamente com seu e-mail e senha.",
  ACCOUNT_TEMPORARILY_LOCKED: "Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.",
};

// After the password: a 6-digit code from the app, or one backup code.
export async function verifySecondFactorAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = formText(formData, "code").replace(/\s/g, "");
  const request = { body: { code }, headers: await headers() };
  let destination: string;
  try {
    const { user } = /^\d{6}$/.test(code)
      ? await auth.api.verifyTOTP(request)
      : await auth.api.verifyBackupCode(request);
    destination = safeReturnPath(formText(formData, returnToParam), roleOf(user));
  } catch (error) {
    const message = challengeRefusals[errorCode(error) ?? ""];
    if (message) return { status: "error", message };
    throw error;
  }
  redirect(destination);
}
