import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { invitation, member, user } from "@/db/schema";
import { createPlatformAdmin } from "@/modules/identity";
import {
  createTenantOnboarding,
  createTenantRepository,
  findTenantOwnerEmail,
  resolveTenantScope,
  type TenantScope,
} from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestMailer } from "@/test/support/mailer";

const acceptedAt = new Date("2026-03-10T15:30:00.000Z");

let db: Database;
let onboarding: ReturnType<typeof createTenantOnboarding>;
let adminId: string;
let tenantA: { tenantId: string; ownerId: string };
let tenantB: { tenantId: string; ownerId: string };
let scopeA: TenantScope;
let scopeB: TenantScope;

const onboardTenant = async (tenantName: string, ownerEmail: string) => {
  const created = await onboarding.createTenant(adminId, {
    tenantName,
    ownerEmail,
  });
  if (!created.ok) throw new Error("setup failed");
  const accepted = await onboarding.acceptInvitation({
    invitationId: created.invitationId,
    acceptedTerms: true,
    name: `Dono ${tenantName}`,
    password: "senha-segura-123",
  });
  if (!accepted.ok) throw new Error("setup failed");
  return { tenantId: created.tenantId, ownerId: accepted.userId };
};

const resolve = async (userId: string, activeTenantId?: string) => {
  const scope = await resolveTenantScope(db, { userId, activeTenantId });
  if (!scope) throw new Error("expected a Tenant scope");
  return scope;
};

const addPendingInvitation = async (tenantId: string, inviterId: string) => {
  const [created] = await db
    .insert(invitation)
    .values({
      organizationId: tenantId,
      email: "convidado@example.com",
      role: "member",
      expiresAt: new Date("2026-04-01T00:00:00.000Z"),
      inviterId,
    })
    .returning({ id: invitation.id });
  return created.id;
};

afterAll(() => closeTestDatabase(db));

beforeAll(async () => {
  db = await createTestDatabase();
  onboarding = createTenantOnboarding({
    db,
    mailer: createTestMailer(),
    clock: createTestClock(acceptedAt),
    appUrl: "https://bots.example.com",
  });
  ({ id: adminId } = await createPlatformAdmin(db, {
    name: "Daniel Admin",
    email: "admin@clickstudio.example",
    password: "admin-password-123",
  }));
  tenantA = await onboardTenant("Clínica A", "dono@a.example");
  tenantB = await onboardTenant("Clínica B", "dono@b.example");
  scopeA = await resolve(tenantA.ownerId);
  scopeB = await resolve(tenantB.ownerId);
});

describe("resolving Tenant scope", () => {
  test("a Member resolves to the Tenant they belong to", () => {
    expect(scopeA).toMatchObject({
      tenantId: tenantA.tenantId,
      userId: tenantA.ownerId,
      role: "owner",
    });
  });

  test("a Member of Tenant A cannot resolve Tenant B by passing its id", async () => {
    expect(
      await resolveTenantScope(db, {
        userId: tenantA.ownerId,
        activeTenantId: tenantB.tenantId,
      }),
    ).toBeNull();
  });

  test("someone who belongs to no Tenant has no Tenant scope", async () => {
    expect(await resolveTenantScope(db, { userId: adminId })).toBeNull();
  });
});

describe("Tenant-scoped data access", () => {
  test("background notifications select the earliest owner in the requested Tenant", async () => {
    const createdAt = new Date("2020-01-01T00:00:00Z");
    for (const [id, role] of [
      ["earlier-member", "member"],
      ["owner-b", "owner"],
      ["owner-a", "owner"],
    ]) {
      await db.insert(user).values({ id, name: id, email: `${id}@a.example` });
      await db.insert(member).values({
        id,
        userId: id,
        organizationId: tenantA.tenantId,
        role,
        createdAt: role === "member" ? new Date("2019-01-01T00:00:00Z") : createdAt,
      });
    }
    try {
      expect(await findTenantOwnerEmail(db, tenantA.tenantId)).toBe("owner-a@a.example");
      expect(await findTenantOwnerEmail(db, tenantB.tenantId)).toBe("dono@b.example");
      expect(await findTenantOwnerEmail(db, "missing-tenant")).toBeNull();
    } finally {
      for (const id of ["earlier-member", "owner-b", "owner-a"])
        await db.delete(user).where(eq(user.id, id));
    }
  });

  test("reads only the scoped Tenant's profile and Members", async () => {
    const tenant = createTenantRepository(db, scopeA);

    expect(await tenant.getTenant()).toMatchObject({ name: "Clínica A" });
    expect(await tenant.listMembers()).toEqual([
      expect.objectContaining({ email: "dono@a.example", role: "owner" }),
    ]);
  });

  test("a Member of Tenant A cannot read a Tenant B Member by passing its id", async () => {
    const tenant = createTenantRepository(db, scopeA);

    expect(await tenant.findMember(scopeB.memberId)).toBeNull();
    expect(await tenant.findMember(scopeA.memberId)).toMatchObject({
      email: "dono@a.example",
    });
  });

  test("records who accepted the Terms and DPA and when, visible only to that Tenant", async () => {
    expect(await createTenantRepository(db, scopeA).listLegalAcceptances()).toEqual([
      {
        memberName: "Dono Clínica A",
        termsVersion: "2026-10-19",
        acceptedAt,
      },
    ]);
  });

  test("a Member of Tenant A cannot cancel a Tenant B invitation by passing its id", async () => {
    const invitationB = await addPendingInvitation(tenantB.tenantId, tenantB.ownerId);
    const invitationA = await addPendingInvitation(tenantA.tenantId, tenantA.ownerId);
    const tenant = createTenantRepository(db, scopeA);

    expect(await tenant.cancelInvitation(invitationB)).toBe(false);
    expect(await onboarding.findInvitation(invitationB)).toMatchObject({
      status: "pending",
    });

    expect(await tenant.cancelInvitation(invitationA)).toBe(true);
    expect(await onboarding.findInvitation(invitationA)).toMatchObject({
      status: "canceled",
    });
  });
});
