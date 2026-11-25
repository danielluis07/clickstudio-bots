// Run in a separate Bun process so these module mocks cannot affect other tests.
import { mock } from "bun:test";
import { APIError } from "better-auth/api";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

let role = "user";
let twoFactorEnabled = true;
let heldForSecondFactor = false;
let refusal: APIError | null = null;
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/server/auth/auth", () => ({
  auth: {
    api: {
      signInEmail: async () => {
        if (refusal) throw refusal;
        if (heldForSecondFactor) return { twoFactorRedirect: true, twoFactorMethods: ["totp"] };
        return { user: { id: "test-user", role, twoFactorEnabled } };
      },
    },
  },
}));

const { signInAction } = await import("@/server/actions/session");
type Case = {
  role: string;
  returnTo?: string;
  expected: string;
  // How Better Auth answers: a session, a session for an administrator
  // without a second factor, or a sign-in held until the code.
  answer?: "session" | "unenrolled" | "held";
};
const cases: Case[] = [
  { role: "admin", expected: "/admin" },
  { role: "admin", returnTo: "/painel", expected: "/admin" },
  { role: "admin", returnTo: "/painel/conversas?conversa=123", expected: "/admin" },
  { role: "admin", returnTo: "/admin?negocio=123", expected: "/admin?negocio=123" },
  { role: "admin", returnTo: "https://evil.example", expected: "/admin" },
  { role: "admin", returnTo: "//evil.example", expected: "/admin" },
  { role: "user", expected: "/painel" },
  {
    role: "user",
    returnTo: "/painel/conversas?conversa=123",
    expected: "/painel/conversas?conversa=123",
  },
  { role: "user", returnTo: "https://evil.example", expected: "/painel" },
  { role: "admin", answer: "unenrolled", expected: "/entrar/segundo-fator" },
  { role: "admin", answer: "held", expected: "/entrar/verificacao" },
  {
    role: "admin",
    answer: "held",
    returnTo: "/admin/eventos",
    expected: "/entrar/verificacao?voltar=%2Fadmin%2Feventos",
  },
];

for (const scenario of cases) {
  role = scenario.role;
  twoFactorEnabled = scenario.answer !== "unenrolled";
  heldForSecondFactor = scenario.answer === "held";
  const formData = new FormData();
  formData.set("email", "test@example.com");
  formData.set("password", "test-only-password");
  if (scenario.returnTo) formData.set("voltar", scenario.returnTo);

  let destination: string | null = null;
  try {
    await signInAction({ status: "idle" }, formData);
  } catch (error) {
    if (!isRedirectError(error)) throw error;
    destination = getURLFromRedirectError(error);
  }
  if (destination !== scenario.expected) {
    throw new Error(
      `${role} login (voltar=${scenario.returnTo ?? "empty"}): expected first destination ${scenario.expected}, received ${destination}`,
    );
  }
}

console.log(`${cases.length} sign-in destinations passed`);

const { tooManySignInAttemptsCode, tooManySignInAttemptsMessage } =
  await import("@/server/auth/sign-in-limit");
const refusals = [
  {
    error: new APIError("UNAUTHORIZED", { message: "Invalid email or password" }),
    expected: "E-mail ou senha incorretos.",
  },
  {
    error: new APIError("TOO_MANY_REQUESTS", { code: tooManySignInAttemptsCode }),
    expected: tooManySignInAttemptsMessage,
  },
];
heldForSecondFactor = false;
for (const { error, expected } of refusals) {
  refusal = error;
  const formData = new FormData();
  formData.set("email", "test@example.com");
  formData.set("password", "test-only-password");
  const state = await signInAction({ status: "idle" }, formData);
  if (state.status !== "error" || state.message !== expected) {
    throw new Error(
      `sign-in refused with ${error.status}: expected "${expected}", received ${JSON.stringify(state)}`,
    );
  }
}

console.log(`${refusals.length} sign-in refusal messages passed`);
