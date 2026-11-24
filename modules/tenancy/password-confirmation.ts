import { z } from "zod";

// Browser-safe: the invitation form checks it before submitting and the
// Server Action checks it again. Only a new account types its password twice.
const passwordConfirmationSchema = z
  .object({
    password: z.string(),
    passwordConfirmation: z.string().optional(),
  })
  .refine(
    ({ password, passwordConfirmation }) =>
      passwordConfirmation === undefined || passwordConfirmation === password,
    { message: "As senhas não conferem.", path: ["passwordConfirmation"] },
  );

type PasswordConfirmation = z.input<typeof passwordConfirmationSchema>;

// Reads the two password fields; the confirmation is absent when the invited
// email already has an account.
const passwordConfirmationFields = (formData: FormData): PasswordConfirmation => {
  const password = formData.get("password");
  const confirmation = formData.get("passwordConfirmation");
  return {
    password: typeof password === "string" ? password : "",
    passwordConfirmation: typeof confirmation === "string" ? confirmation : undefined,
  };
};

// The first refusal's message, or null when the passwords match.
export const passwordConfirmationError = (formData: FormData) => {
  const parsed = passwordConfirmationSchema.safeParse(passwordConfirmationFields(formData));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? null);
};
