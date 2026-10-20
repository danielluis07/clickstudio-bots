import { beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { createPlatformAdmin, createUserRepository } from "@/modules/identity";
import { createTenantOnboarding } from "@/modules/tenancy";
import { systemClock } from "@/platform/clock";
import { createAuth } from "@/server/auth/create-auth";
import { createTestDatabase } from "@/test/support/database";
import { createTestMailer } from "@/test/support/mailer";

const baseURL = "http://localhost:3000";

let db: Database;
let auth: ReturnType<typeof createAuth>;
let pendingInvitationId: string;

const post = (path: string, body: unknown, cookie?: string) =>
  auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseURL,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

const signIn = async (email: string, password: string) => {
  const response = await post("/sign-in/email", { email, password });
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
};

beforeAll(async () => {
  db = await createTestDatabase();
  auth = createAuth({
    db,
    baseURL,
    secret: "test-secret-with-enough-entropy-0123456789",
  });
  const onboarding = createTenantOnboarding({
    db,
    mailer: createTestMailer(),
    clock: systemClock,
    appUrl: baseURL,
  });
  const admin = await createPlatformAdmin(db, {
    name: "Daniel Admin",
    email: "admin@clickstudio.example",
    password: "admin-password-123",
  });
  const owned = await onboarding.createTenant(admin.id, {
    tenantName: "Clínica Sorriso",
    ownerEmail: "dona@sorriso.example",
  });
  const pending = await onboarding.createTenant(admin.id, {
    tenantName: "Outro Negócio",
    ownerEmail: "dona@sorriso.example",
  });
  if (!owned.ok || !pending.ok) throw new Error("setup failed");
  pendingInvitationId = pending.invitationId;
  await onboarding.acceptInvitation({
    invitationId: owned.invitationId,
    acceptedTerms: true,
    name: "Dona Sorriso",
    password: "senha-segura-123",
  });
});

describe("auth routes", () => {
  test("public sign-up is disabled", async () => {
    const response = await post("/sign-up/email", {
      name: "Intrusa",
      email: "intrusa@example.com",
      password: "senha-segura-123",
    });

    expect(response.ok).toBe(false);
    expect(
      await createUserRepository(db).findByEmail("intrusa@example.com"),
    ).toBeNull();
  });

  test("an owner who accepted an invitation signs in with the password they set", async () => {
    expect(await signIn("dona@sorriso.example", "senha-segura-123")).toContain(
      "better-auth.session_token=",
    );
  });

  test("the session carries the platform role, which users cannot change themselves", async () => {
    const sessionRole = async (cookie: string) => {
      const response = await auth.handler(
        new Request(`${baseURL}/api/auth/get-session`, { headers: { cookie } }),
      );
      return (await response.json()).user.role;
    };
    const adminCookie = await signIn("admin@clickstudio.example", "admin-password-123");
    const ownerCookie = await signIn("dona@sorriso.example", "senha-segura-123");

    await post("/update-user", { role: "admin" }, ownerCookie);

    expect(await sessionRole(adminCookie)).toBe("admin");
    expect(await sessionRole(ownerCookie)).toBe("user");
  });

  test("no route creates a Member without the Terms/DPA invitation flow", async () => {
    const cookie = await signIn("dona@sorriso.example", "senha-segura-123");

    for (const [path, body] of [
      ["/organization/create", { name: "Atalho", slug: "atalho" }],
      ["/organization/accept-invitation", { invitationId: pendingInvitationId }],
      [
        "/organization/invite-member",
        { email: "novo@example.com", role: "member" },
      ],
    ] as const) {
      const response = await post(path, body, cookie);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
  });

  test("Tenant data is not reachable through Better Auth's organization routes", async () => {
    const cookie = await signIn("dona@sorriso.example", "senha-segura-123");

    for (const path of [
      "/organization/get-full-organization",
      "/organization/list-members",
    ]) {
      const response = await auth.handler(
        new Request(`${baseURL}/api/auth${path}`, { headers: { cookie } }),
      );
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
    for (const [path, body] of [
      ["/organization/update", { data: { name: "Renomeado" } }],
      ["/organization/remove-member", { memberIdOrEmail: "dona@sorriso.example" }],
    ] as const) {
      const response = await post(path, body, cookie);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
  });
});
