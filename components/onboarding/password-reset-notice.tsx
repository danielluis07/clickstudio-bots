"use client";

import { useSearchParams } from "next/navigation";
import { FormMessage } from "@/components/forms/form-message";
import { passwordResetDoneParam } from "@/server/auth/redirects";

// Confirms a reset after resetPasswordAction redirects to the sign-in page.
export function PasswordResetNotice() {
  if (!useSearchParams().has(passwordResetDoneParam)) return null;

  return (
    <FormMessage state={{ status: "success", message: "Senha redefinida. Entre com a nova senha." }} />
  );
}
