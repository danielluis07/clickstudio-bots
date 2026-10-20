import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { createPlatformAdmin, createUserRepository } from "@/modules/identity";
import {
  createMemberManagement,
  createTenantOnboarding,
  createTenantRepository,
  invitationLifetimeDays,
  resolveTenantScope,
  type TenantScope,
} from "@/modules/tenancy";
import { createTestClock, type TestClock } from "@/test/support/clock";
import { createTestDatabase } from "@/test/support/database";
import { createTestMailer, type TestMailer } from "@/test/support/mailer";

const appUrl = "https://bots.example.com";

let db: Database;
let mailer: TestMailer;
let clock: TestClock;
let onboarding: ReturnType<typeof createTenantOnboarding>;
let members: ReturnType<typeof createMemberManagement>;
let adminId: string;
let ownerScope: TenantScope;

const scopeOf = async (userId: string, activeTenantId?: string) => {
  const scope = await resolveTenantScope(db, { userId, activeTenantId });
  if (!scope) throw new Error("expected a Tenant scope");
  return scope;
};

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
  return scopeOf(accepted.userId, created.tenantId);
};

const invite = async (email: string, scope = ownerScope) => {
  const invited = await members.inviteMember(scope, { email });
  if (!invited.ok) throw new Error(`setup failed: ${invited.error}`);
  return invited.invitationId;
};

const joinAsMember = async (scope: TenantScope, email: string) => {
  const accepted = await onboarding.acceptInvitation({
    invitationId: await invite(email, scope),
    acceptedTerms: true,
    name: `Membro ${email}`,
    password: "senha-segura-123",
  });
  if (!accepted.ok) throw new Error(`setup failed: ${accepted.error}`);
  return scopeOf(accepted.userId, scope.tenantId);
};

beforeEach(async () => {
  db = await createTestDatabase();
  mailer = createTestMailer();
  clock = createTestClock();
  onboarding = createTenantOnboarding({ db, mailer, clock, appUrl });
  members = createMemberManagement({ db, mailer, clock, appUrl });
  ({ id: adminId } = await createPlatformAdmin(db, {
    name: "Daniel Admin",
    email: "admin@clickstudio.example",
    password: "admin-password-123",
  }));
  ownerScope = await onboardTenant("Clínica Sorriso", "dona@sorriso.example");
  mailer.sent.length = 0;
});

describe("joining as an invited Member", () => {
  test("joins only the inviting Tenant, without the owner's Terms and DPA click-through", async () => {
    const otherScope = await onboardTenant("Outra Clínica", "dono@outra.example");
    const invitationId = await invite("ana@sorriso.example");

    const accepted = await onboarding.acceptInvitation({
      invitationId,
      acceptedTerms: false,
      name: "Ana Atendente",
      password: "senha-segura-123",
    });

    expect(accepted).toMatchObject({ ok: true, tenantId: ownerScope.tenantId });
    if (!accepted.ok) return;
    expect(
      await resolveTenantScope(db, { userId: accepted.userId }),
    ).toMatchObject({ tenantId: ownerScope.tenantId, role: "member" });
    expect(
      await resolveTenantScope(db, {
        userId: accepted.userId,
        activeTenantId: otherScope.tenantId,
      }),
    ).toBeNull();
    expect(
      await createTenantRepository(db, otherScope).listMembers(),
    ).not.toContainEqual(expect.objectContaining({ email: "ana@sorriso.example" }));
    expect(
      await createTenantRepository(db, ownerScope).listLegalAcceptances(),
    ).toEqual([expect.objectContaining({ memberName: "Dono Clínica Sorriso" })]);
  });
});

describe("inviting Members", () => {
  test("the owner invites a Member by email in pt-BR", async () => {
    const result = await members.inviteMember(ownerScope, {
      email: " Ana@Sorriso.example",
    });

    expect(result).toMatchObject({
      ok: true,
      email: "ana@sorriso.example",
      emailSent: true,
    });
    if (!result.ok) return;
    expect(result.invitationUrl).toBe(
      `${appUrl}/convite/${result.invitationId}`,
    );

    expect(mailer.sent).toHaveLength(1);
    const [email] = mailer.sent;
    expect(email.to).toBe("ana@sorriso.example");
    expect(email.subject).toBe("Convite para a equipe de Clínica Sorriso");
    expect(email.text).toContain(result.invitationUrl);
    expect(email.html).toContain(result.invitationUrl);

    expect(await onboarding.findInvitation(result.invitationId)).toMatchObject({
      status: "pending",
      role: "member",
      tenantName: "Clínica Sorriso",
      canAccept: true,
    });
  });

  test("a mail failure keeps the invitation and returns its link for manual delivery", async () => {
    mailer.failNext();

    const result = await members.inviteMember(ownerScope, {
      email: "ana@sorriso.example",
    });

    expect(result).toMatchObject({ ok: true, emailSent: false });
    if (!result.ok) return;
    expect(await onboarding.findInvitation(result.invitationId)).toMatchObject({
      status: "pending",
    });
  });

  test("a Member who is not the owner cannot invite", async () => {
    const memberScope = await joinAsMember(ownerScope, "ana@sorriso.example");
    mailer.sent.length = 0;

    expect(
      await members.inviteMember(memberScope, { email: "bia@sorriso.example" }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(mailer.sent).toHaveLength(0);
  });

  test("an eleventh Member is refused, counting pending invitations", async () => {
    for (const name of ["ana", "bia", "caio", "duda"]) {
      await joinAsMember(ownerScope, `${name}@sorriso.example`);
    }
    for (const name of ["edu", "fabi", "gabi", "hugo", "iara"]) {
      await invite(`${name}@sorriso.example`);
    }
    mailer.sent.length = 0;

    expect(
      await members.inviteMember(ownerScope, { email: "juca@sorriso.example" }),
    ).toEqual({ ok: false, error: "allowance_reached" });
    expect(mailer.sent).toHaveLength(0);
  });

  test("canceled and expired invitations free their seats", async () => {
    const pending = [];
    for (let seat = 1; seat <= 9; seat++) {
      pending.push(await invite(`pessoa${seat}@sorriso.example`));
    }
    expect(
      await members.inviteMember(ownerScope, { email: "extra@sorriso.example" }),
    ).toMatchObject({ ok: false, error: "allowance_reached" });

    await createTenantRepository(db, ownerScope).cancelInvitation(pending[0]);
    expect(await invite("extra@sorriso.example")).toBeString();

    clock.advance(invitationLifetimeDays * 24 * 60 * 60 * 1000);
    expect(await invite("depois@sorriso.example")).toBeString();
  });

  test("someone who is already a Member of the Tenant cannot be invited again", async () => {
    await joinAsMember(ownerScope, "ana@sorriso.example");

    for (const email of ["ana@sorriso.example", "dona@sorriso.example"]) {
      expect(await members.inviteMember(ownerScope, { email })).toEqual({
        ok: false,
        error: "already_member",
      });
    }
  });

  test("inviting a pending email again replaces its invitation without taking another seat", async () => {
    const first = await invite("ana@sorriso.example");
    for (let seat = 2; seat <= 9; seat++) {
      await invite(`pessoa${seat}@sorriso.example`);
    }

    const second = await invite("Ana@Sorriso.example");

    expect(second).not.toBe(first);
    expect(await onboarding.findInvitation(first)).toMatchObject({
      status: "canceled",
      canAccept: false,
    });
    expect(await onboarding.findInvitation(second)).toMatchObject({
      status: "pending",
      canAccept: true,
    });
    expect(
      await members.inviteMember(ownerScope, { email: "extra@sorriso.example" }),
    ).toMatchObject({ ok: false, error: "allowance_reached" });
  });
});

describe("removing Members", () => {
  test("removes a Member who belongs to no other Tenant, deleting their identity", async () => {
    const ana = await joinAsMember(ownerScope, "ana@sorriso.example");

    expect(await members.removeMember(ownerScope, ana.memberId)).toEqual({
      ok: true,
    });

    expect(await resolveTenantScope(db, { userId: ana.userId })).toBeNull();
    expect(
      await createTenantRepository(db, ownerScope).listMembers(),
    ).not.toContainEqual(expect.objectContaining({ email: "ana@sorriso.example" }));
    expect(
      await createUserRepository(db).findByEmail("ana@sorriso.example"),
    ).toBeNull();
    expect(
      await onboarding.findInvitation(await invite("ana@sorriso.example")),
    ).toMatchObject({ hasAccount: false });
  });

  test("keeps the identity of a Member who still belongs to another Tenant", async () => {
    const otherScope = await onboardTenant("Outra Clínica", "dono@outra.example");
    const ana = await joinAsMember(ownerScope, "ana@sorriso.example");
    await joinAsMember(otherScope, "ana@sorriso.example");

    expect(await members.removeMember(ownerScope, ana.memberId)).toEqual({
      ok: true,
    });

    expect(
      await resolveTenantScope(db, {
        userId: ana.userId,
        activeTenantId: ownerScope.tenantId,
      }),
    ).toBeNull();
    expect(await resolveTenantScope(db, { userId: ana.userId })).toMatchObject({
      tenantId: otherScope.tenantId,
    });
    expect(
      await createUserRepository(db).findByEmail("ana@sorriso.example"),
    ).toMatchObject({ id: ana.userId });
  });

  test("keeps the identity of the platform administrator", async () => {
    const accepted = await onboarding.acceptInvitation({
      invitationId: await invite("admin@clickstudio.example"),
      acceptedTerms: false,
      password: "admin-password-123",
    });
    if (!accepted.ok) throw new Error("setup failed");
    const admin = await scopeOf(accepted.userId, ownerScope.tenantId);

    expect(await members.removeMember(ownerScope, admin.memberId)).toEqual({
      ok: true,
    });

    expect(
      await createUserRepository(db).findByEmail("admin@clickstudio.example"),
    ).toMatchObject({ id: adminId });
  });

  test("only the owner removes Members, and the owner cannot be removed", async () => {
    const ana = await joinAsMember(ownerScope, "ana@sorriso.example");
    const bia = await joinAsMember(ownerScope, "bia@sorriso.example");

    expect(await members.removeMember(ana, bia.memberId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await members.removeMember(ownerScope, ownerScope.memberId)).toEqual(
      { ok: false, error: "not_found" },
    );
    expect(await createTenantRepository(db, ownerScope).listMembers()).toHaveLength(3);
  });

  test("the owner of Tenant A cannot remove a Tenant B Member by passing its id", async () => {
    const otherScope = await onboardTenant("Outra Clínica", "dono@outra.example");
    const bruno = await joinAsMember(otherScope, "bruno@outra.example");

    expect(await members.removeMember(ownerScope, bruno.memberId)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await createTenantRepository(db, otherScope).findMember(bruno.memberId),
    ).toMatchObject({ email: "bruno@outra.example" });
  });
});

describe("pending invitations", () => {
  test("the owner sees the Tenant's invitations that can still be accepted", async () => {
    const otherScope = await onboardTenant("Outra Clínica", "dono@outra.example");
    await invite("vizinho@outra.example", otherScope);
    await invite("antiga@sorriso.example");
    clock.advance(invitationLifetimeDays * 24 * 60 * 60 * 1000);
    const live = await invite("ana@sorriso.example");
    await joinAsMember(ownerScope, "bia@sorriso.example");

    expect(await members.listPendingInvitations(ownerScope)).toEqual([
      {
        id: live,
        email: "ana@sorriso.example",
        expiresAt: new Date(
          clock.now().getTime() + invitationLifetimeDays * 24 * 60 * 60 * 1000,
        ),
      },
    ]);
  });

  test("a Member who is not the owner sees no pending invitations", async () => {
    await invite("ana@sorriso.example");
    const bia = await joinAsMember(ownerScope, "bia@sorriso.example");

    expect(await members.listPendingInvitations(bia)).toEqual([]);
  });

  test("only the owner cancels an invitation, and only in their own Tenant", async () => {
    const otherScope = await onboardTenant("Outra Clínica", "dono@outra.example");
    const foreign = await invite("vizinho@outra.example", otherScope);
    const pending = await invite("ana@sorriso.example");
    const bia = await joinAsMember(ownerScope, "bia@sorriso.example");

    expect(await members.cancelInvitation(bia, pending)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await members.cancelInvitation(ownerScope, foreign)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await onboarding.findInvitation(foreign)).toMatchObject({
      status: "pending",
    });

    expect(await members.cancelInvitation(ownerScope, pending)).toEqual({
      ok: true,
    });
    expect(await members.listPendingInvitations(ownerScope)).toEqual([]);
  });
});
