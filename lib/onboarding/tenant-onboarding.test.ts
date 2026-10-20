import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { createTenantOnboarding } from "@/lib/onboarding/tenant-onboarding";
import { createPlatformAdmin } from "@/lib/platform-admin";
import { createTestClock, type TestClock } from "@/test/support/clock";
import { createTestDatabase } from "@/test/support/database";
import { createTestMailer, type TestMailer } from "@/test/support/mailer";

const appUrl = "https://bots.example.com";

let db: Database;
let mailer: TestMailer;
let clock: TestClock;
let onboarding: ReturnType<typeof createTenantOnboarding>;
let adminId: string;

beforeEach(async () => {
  db = await createTestDatabase();
  mailer = createTestMailer();
  clock = createTestClock();
  onboarding = createTenantOnboarding({ db, mailer, clock, appUrl });
  ({ id: adminId } = await createPlatformAdmin(db, {
    name: "Daniel Admin",
    email: "admin@clickstudio.example",
    password: "admin-password-123",
  }));
});

describe("creating a Tenant", () => {
  test("a platform administrator creates a Tenant and invites its owner by email in pt-BR", async () => {
    const result = await onboarding.createTenant(adminId, {
      tenantName: "Clínica Sorriso",
      ownerEmail: "Dona@Sorriso.example ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailSent).toBe(true);
    expect(result.ownerEmail).toBe("dona@sorriso.example");
    expect(result.invitationUrl).toStartWith(`${appUrl}/convite/`);

    expect(mailer.sent).toHaveLength(1);
    const [email] = mailer.sent;
    expect(email.to).toBe("dona@sorriso.example");
    expect(email.subject).toBe("Convite para o ClickStudio Bots: Clínica Sorriso");
    expect(email.text).toContain(result.invitationUrl);
    expect(email.html).toContain(result.invitationUrl);

    const invitation = await onboarding.findInvitation(result.invitationId);
    expect(invitation).toMatchObject({
      status: "pending",
      tenantName: "Clínica Sorriso",
      email: "dona@sorriso.example",
      hasAccount: false,
      canAccept: true,
    });
  });

  test("a Tenant owner who is not a platform administrator cannot create a Tenant", async () => {
    const created = await onboarding.createTenant(adminId, {
      tenantName: "Clínica Sorriso",
      ownerEmail: "dona@sorriso.example",
    });
    if (!created.ok) throw new Error("setup failed");
    const owner = await onboarding.acceptInvitation({
      invitationId: created.invitationId,
      acceptedTerms: true,
      name: "Dona Sorriso",
      password: "senha-segura-123",
    });
    if (!owner.ok) throw new Error("setup failed");
    mailer.sent.length = 0;

    for (const actorUserId of [owner.userId, "unknown-user-id"]) {
      const result = await onboarding.createTenant(actorUserId, {
        tenantName: "Outro Negócio",
        ownerEmail: "outro@negocio.example",
      });
      expect(result).toEqual({ ok: false, error: "forbidden" });
    }
    expect(mailer.sent).toHaveLength(0);
  });

  test("a mail failure still keeps the invitation and returns its link for manual delivery", async () => {
    mailer.failNext();

    const result = await onboarding.createTenant(adminId, {
      tenantName: "Clínica Sorriso",
      ownerEmail: "dona@sorriso.example",
    });

    expect(result).toMatchObject({ ok: true, emailSent: false });
    if (!result.ok) return;
    expect(await onboarding.findInvitation(result.invitationId)).toMatchObject({
      status: "pending",
    });
  });

  test("rejects a blank Tenant name or an invalid owner email", async () => {
    for (const input of [
      { tenantName: "  ", ownerEmail: "dona@sorriso.example" },
      { tenantName: "Clínica Sorriso", ownerEmail: "not-an-email" },
    ]) {
      expect(await onboarding.createTenant(adminId, input)).toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("accepting an owner invitation", () => {
  const inviteOwner = async (ownerEmail = "dona@sorriso.example") => {
    const created = await onboarding.createTenant(adminId, {
      tenantName: "Clínica Sorriso",
      ownerEmail,
    });
    if (!created.ok) throw new Error("setup failed");
    return created;
  };

  const ownerAcceptance = (invitationId: string) => ({
    invitationId,
    acceptedTerms: true,
    name: "Dona Sorriso",
    password: "senha-segura-123",
  });

  test("cannot be accepted without the Terms and DPA click-through", async () => {
    const { invitationId } = await inviteOwner();

    expect(
      await onboarding.acceptInvitation({
        ...ownerAcceptance(invitationId),
        acceptedTerms: false,
      }),
    ).toEqual({ ok: false, error: "terms_required" });
    expect(await onboarding.findInvitation(invitationId)).toMatchObject({
      status: "pending",
    });
  });

  test("creates the owner's account and joins the invited Tenant", async () => {
    const { invitationId, tenantId } = await inviteOwner();

    const result = await onboarding.acceptInvitation(
      ownerAcceptance(invitationId),
    );

    expect(result).toMatchObject({
      ok: true,
      tenantId,
      email: "dona@sorriso.example",
    });
    expect(await onboarding.findInvitation(invitationId)).toMatchObject({
      status: "accepted",
      canAccept: false,
    });
  });

  test("an invitation can only be accepted once", async () => {
    const { invitationId } = await inviteOwner();
    await onboarding.acceptInvitation(ownerAcceptance(invitationId));

    expect(
      await onboarding.acceptInvitation(ownerAcceptance(invitationId)),
    ).toEqual({ ok: false, error: "unavailable" });
  });

  test("an expired invitation cannot be accepted", async () => {
    const { invitationId } = await inviteOwner();
    clock.advance(7 * 24 * 60 * 60 * 1000);
    expect(await onboarding.findInvitation(invitationId)).toMatchObject({
      status: "pending",
      canAccept: false,
    });

    expect(
      await onboarding.acceptInvitation(ownerAcceptance(invitationId)),
    ).toEqual({ ok: false, error: "unavailable" });
  });

  test("an unknown invitation cannot be accepted", async () => {
    expect(
      await onboarding.acceptInvitation(ownerAcceptance("missing-invitation")),
    ).toEqual({ ok: false, error: "unavailable" });
  });

  test("rejects a password shorter than eight characters for a new account", async () => {
    const { invitationId } = await inviteOwner();

    expect(
      await onboarding.acceptInvitation({
        ...ownerAcceptance(invitationId),
        password: "curta",
      }),
    ).toEqual({ ok: false, error: "invalid" });
  });

  test("an email that already has an account must confirm its current password", async () => {
    const first = await inviteOwner();
    await onboarding.acceptInvitation(ownerAcceptance(first.invitationId));
    const second = await inviteOwner();
    expect(await onboarding.findInvitation(second.invitationId)).toMatchObject({
      hasAccount: true,
    });

    expect(
      await onboarding.acceptInvitation({
        ...ownerAcceptance(second.invitationId),
        password: "senha-errada-123",
      }),
    ).toEqual({ ok: false, error: "wrong_password" });

    expect(
      await onboarding.acceptInvitation(ownerAcceptance(second.invitationId)),
    ).toMatchObject({ ok: true, tenantId: second.tenantId });
  });
});
