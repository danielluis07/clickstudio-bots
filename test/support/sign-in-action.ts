// Run in a separate Bun process so these module mocks cannot affect other tests.
import { mock } from "bun:test";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

let role = "user";
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/server/auth/auth", () => ({
  auth: {
    api: {
      signInEmail: async () => ({ user: { id: "test-user", role } }),
    },
  },
}));

const { signInAction } = await import("@/server/actions/session");
const cases: { role: string; returnTo?: string; expected: string }[] = [
  { role: "admin", expected: "/admin" },
  { role: "admin", returnTo: "/painel", expected: "/admin" },
  { role: "admin", returnTo: "/painel/conversas?conversa=123", expected: "/admin" },
  { role: "admin", returnTo: "/admin?negocio=123", expected: "/admin?negocio=123" },
  { role: "admin", returnTo: "https://evil.example", expected: "/admin" },
  { role: "admin", returnTo: "//evil.example", expected: "/admin" },
  { role: "user", expected: "/painel" },
  { role: "user", returnTo: "/painel/conversas?conversa=123", expected: "/painel/conversas?conversa=123" },
  { role: "user", returnTo: "https://evil.example", expected: "/painel" },
];

for (const scenario of cases) {
  role = scenario.role;
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
    throw new Error(`${role} login (voltar=${scenario.returnTo ?? "empty"}): expected first destination ${scenario.expected}, received ${destination}`);
  }
}

console.log(`${cases.length} sign-in destinations passed`);
