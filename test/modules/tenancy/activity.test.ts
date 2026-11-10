import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact, conversation, member, memberActivity, organization, user } from "@/db/schema";
import {
  createBotActivation,
  createBotSettingsEditor,
  createCaptureSettingsEditor,
  createLinkSettingsEditor,
} from "@/modules/bot";
import {
  createContactDeletion,
  createHandoffControls,
  recordInboundTextMessage,
} from "@/modules/conversations";
import { createPlatformAdmin } from "@/modules/identity";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import {
  createMemberManagement,
  createTenantExport,
  createTenantOnboarding,
  pruneCanceledTenants,
  resolveTenantScope,
} from "@/modules/tenancy";
import { testBehaviour } from "@/test/support/bot";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestMailer } from "@/test/support/mailer";
import { createTestNotifier } from "@/test/support/notifier";

const appUrl = "https://bots.example.com";

let db: Database;
let tenant: Awaited<ReturnType<typeof seedLiveBot>>;
let other: Awaited<ReturnType<typeof seedLiveBot>>;

beforeEach(async () => {
  db = await createTestDatabase();
  tenant = await seedLiveBot(db);
  other = await seedLiveBot(db);
});

afterEach(() => closeTestDatabase(db));

const entries = (tenantId: string) =>
  db
    .select({
      actorUserId: memberActivity.actorUserId,
      action: memberActivity.action,
      subjectId: memberActivity.subjectId,
    })
    .from(memberActivity)
    .where(eq(memberActivity.tenantId, tenantId))
    .orderBy(asc(memberActivity.occurredAt), asc(memberActivity.id));

// Drizzle queries are thenables; adopt them so `rejects` can await them.
const refuses = (query: PromiseLike<unknown>) => expect(Promise.resolve(query)).rejects.toThrow();

let sequence = 0;
const startConversation = async (seeded = tenant, phone = "5511999990001") => {
  await recordInboundTextMessage(db, seeded.route, {
    wamid: `wamid.activity.${++sequence}`,
    from: phone,
    profileName: "Ana Contato",
    text: "Quero saber o preço",
    sentAt: seeded.clock.now(),
  });
  const [found] = await db
    .select({ id: conversation.id, contactId: conversation.contactId })
    .from(conversation)
    .innerJoin(contact, eq(contact.id, conversation.contactId))
    .where(eq(contact.phone, phone));
  return found;
};

describe("Handoff controls", () => {
  test("record who took over, returned and resolved each Conversation", async () => {
    const controls = createHandoffControls({
      db,
      clock: tenant.clock,
      notifier: createTestNotifier(),
    });
    const first = await startConversation();
    const second = await startConversation(tenant, "5511999990002");
    const actor = tenant.scope.userId;

    await controls.takeOver(tenant.scope, first.id);
    // Already with the team: nothing changed hands, so nothing is recorded.
    await controls.takeOver(tenant.scope, first.id);
    await controls.returnToBot(tenant.scope, first.id);
    await controls.takeOver(tenant.scope, first.id);
    await controls.resolve(tenant.scope, first.id);
    await controls.bulkReturnToBot(tenant.scope, [first.id, second.id]);

    expect(await entries(tenant.scope.tenantId)).toEqual([
      { actorUserId: actor, action: "conversation.taken_over", subjectId: first.id },
      { actorUserId: actor, action: "conversation.returned_to_bot", subjectId: first.id },
      { actorUserId: actor, action: "conversation.taken_over", subjectId: first.id },
      { actorUserId: actor, action: "conversation.resolved", subjectId: first.id },
      ...[first.id, second.id].toSorted().map((subjectId) => ({
        actorUserId: actor,
        action: "conversation.returned_to_bot" as const,
        subjectId,
      })),
    ]);
  });

  test("another Tenant's Member cannot act on the Conversation or write to its log", async () => {
    const controls = createHandoffControls({
      db,
      clock: tenant.clock,
      notifier: createTestNotifier(),
    });
    const { id } = await startConversation();

    expect(await controls.takeOver(other.scope, id)).toEqual({ ok: false, error: "not_found" });
    expect(await controls.resolve(other.scope, id)).toEqual({ ok: false, error: "not_found" });
    expect(await controls.bulkReturnToBot(other.scope, [id])).toEqual({
      ok: false,
      error: "not_found",
    });

    expect(await entries(tenant.scope.tenantId)).toEqual([]);
    expect(await entries(other.scope.tenantId)).toEqual([]);
  });

  test("an entry that cannot be written rolls the change back", async () => {
    const controls = createHandoffControls({
      db,
      clock: tenant.clock,
      notifier: createTestNotifier(),
    });
    const { id } = await startConversation();
    await queryTestDatabase(
      db,
      `CREATE FUNCTION refuse_activity() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'activity log unavailable'; END $$`,
    );
    await queryTestDatabase(
      db,
      `CREATE TRIGGER refuse_activity BEFORE INSERT ON member_activity
       FOR EACH ROW EXECUTE FUNCTION refuse_activity()`,
    );

    await refuses(controls.takeOver(tenant.scope, id));

    const [stored] = await db
      .select({ owner: conversation.owner })
      .from(conversation)
      .where(eq(conversation.id, id));
    expect(stored.owner).toBe("bot");
  });
});

describe("Contact deletion", () => {
  test("keeps an entry with the Contact's id and nothing that identifies the person", async () => {
    const { contactId } = await startConversation();
    const deleteContact = createContactDeletion({
      db,
      clock: tenant.clock,
      notifier: createTestNotifier(),
    });

    expect(await deleteContact(tenant.scope, contactId)).toEqual({ ok: true });

    const stored = await db
      .select()
      .from(memberActivity)
      .where(eq(memberActivity.tenantId, tenant.scope.tenantId));
    expect(stored).toEqual([
      {
        id: expect.any(String),
        tenantId: tenant.scope.tenantId,
        actorUserId: tenant.scope.userId,
        action: "contact.deleted",
        subjectId: contactId,
        occurredAt: tenant.clock.now(),
      },
    ]);
    const text = JSON.stringify(stored);
    for (const personal of ["5511999990001", "Ana Contato", "Quero saber o preço"])
      expect(text).not.toContain(personal);
  });

  test("a refused deletion writes nothing", async () => {
    const { contactId } = await startConversation();
    const deleteContact = createContactDeletion({
      db,
      clock: tenant.clock,
      notifier: createTestNotifier(),
    });

    expect(await deleteContact(other.scope, contactId)).toEqual({ ok: false, error: "not_found" });
    expect(await entries(tenant.scope.tenantId)).toEqual([]);
    expect(await entries(other.scope.tenantId)).toEqual([]);
  });
});

describe("Members and invitations", () => {
  test("record the owner's invitations and removals and the invitee's acceptance", async () => {
    const mailer = createTestMailer();
    const deps = { db, mailer, clock: tenant.clock, appUrl };
    const members = createMemberManagement(deps);
    const onboarding = createTenantOnboarding(deps);
    const owner = tenant.scope.userId;

    const canceled = await members.inviteMember(tenant.scope, { email: "ana@example.com" });
    const accepted = await members.inviteMember(tenant.scope, { email: "bia@example.com" });
    if (!canceled.ok || !accepted.ok) throw new Error("setup failed");
    await members.cancelInvitation(tenant.scope, canceled.invitationId);
    const joined = await onboarding.acceptInvitation({
      invitationId: accepted.invitationId,
      acceptedTerms: false,
      name: "Bia Atendente",
      password: "senha-segura-123",
    });
    if (!joined.ok) throw new Error("setup failed");
    const scope = await resolveTenantScope(db, { userId: joined.userId });
    if (!scope) throw new Error("setup failed");
    // A Member cannot remove anyone, and the owner's second try finds nobody.
    await members.removeMember(scope, scope.memberId);
    await members.removeMember(tenant.scope, scope.memberId);
    await members.removeMember(tenant.scope, scope.memberId);

    expect(await entries(tenant.scope.tenantId)).toEqual([
      { actorUserId: owner, action: "invitation.created", subjectId: canceled.invitationId },
      { actorUserId: owner, action: "invitation.created", subjectId: accepted.invitationId },
      { actorUserId: owner, action: "invitation.canceled", subjectId: canceled.invitationId },
      {
        actorUserId: joined.userId,
        action: "invitation.accepted",
        subjectId: accepted.invitationId,
      },
      { actorUserId: owner, action: "member.removed", subjectId: scope.memberId },
    ]);
    const text = JSON.stringify(await db.select().from(memberActivity));
    for (const personal of ["ana@example.com", "bia@example.com", "Bia Atendente"])
      expect(text).not.toContain(personal);
  });

  test("record the platform administrator creating a Tenant", async () => {
    const { id: adminId } = await createPlatformAdmin(db, {
      name: "Admin",
      email: "admin@clickstudio.example",
      password: "admin-password-123",
    });
    const onboarding = createTenantOnboarding({
      db,
      mailer: createTestMailer(),
      clock: tenant.clock,
      appUrl,
    });

    const created = await onboarding.createTenant(adminId, {
      tenantName: "Clínica Nova",
      ownerEmail: "dona@nova.example",
    });
    if (!created.ok) throw new Error("setup failed");

    expect(await entries(created.tenantId)).toEqual([
      { actorUserId: adminId, action: "invitation.created", subjectId: created.invitationId },
    ]);
  });
});

describe("the Bot", () => {
  test("records activation, pause and every settings save", async () => {
    const { scope, clock } = tenant;
    const settings = createBotSettingsEditor({ db, clock });
    const capture = createCaptureSettingsEditor({ db, clock });
    const links = createLinkSettingsEditor({ db, clock });
    const activation = createBotActivation({ db, clock });

    await settings.saveSettings(scope, testBehaviour);
    await capture.saveCapture(scope, (await capture.getCapture(scope)).settings);
    await links.saveLinks(scope, (await links.getLinks(scope)).settings);
    // Refused: the Bot is not active yet, and a Member cannot save settings.
    await activation.setPaused(scope, true);
    await settings.saveSettings({ ...scope, role: "member" }, testBehaviour);
    await createKnowledgeBaseEditor({ db, clock }).addEntry(scope, {
      kind: "faq",
      title: "Preço?",
      body: "R$ 80",
    });
    await activation.markTested(scope, clock.now());
    expect(await activation.activate(scope)).toEqual({ ok: true });
    await activation.setPaused(scope, true);
    await activation.setPaused(scope, false);

    expect((await entries(scope.tenantId)).map(({ action }) => action)).toEqual([
      "behaviour_settings.saved",
      "capture_settings.saved",
      "link_settings.saved",
      "bot.activated",
      "bot.paused",
      "bot.unpaused",
    ]);
    expect(await entries(other.scope.tenantId)).toEqual([]);
  });
});

describe("the log", () => {
  const seedEntry = async () => {
    await createHandoffControls({
      db,
      clock: tenant.clock,
      notifier: createTestNotifier(),
    }).takeOver(tenant.scope, (await startConversation()).id);
    const [entry] = await db.select().from(memberActivity);
    return entry;
  };

  test("refuses updates, deletes and truncation while the Tenant exists", async () => {
    const entry = await seedEntry();

    await refuses(
      db
        .update(memberActivity)
        .set({ actorUserId: "someone-else" })
        .where(eq(memberActivity.id, entry.id)),
    );
    await refuses(db.delete(memberActivity).where(eq(memberActivity.id, entry.id)));
    await refuses(queryTestDatabase(db, "TRUNCATE member_activity"));

    expect(await db.select().from(memberActivity)).toEqual([entry]);
  });

  test("survives the removal of its actor", async () => {
    const entry = await seedEntry();
    await db.delete(member).where(eq(member.userId, tenant.scope.userId));
    await db.delete(user).where(eq(user.id, tenant.scope.userId));

    expect(await db.select().from(memberActivity)).toEqual([entry]);
  });

  test("is exported with its Tenant only", async () => {
    await seedEntry();
    await createHandoffControls({
      db,
      clock: other.clock,
      notifier: createTestNotifier(),
    }).takeOver(other.scope, (await startConversation(other, "5511999990009")).id);
    const { id: adminId } = await createPlatformAdmin(db, {
      name: "Admin",
      email: "admin@clickstudio.example",
      password: "admin-password-123",
    });

    const exported = await createTenantExport({ db, clock: tenant.clock }).export(
      adminId,
      tenant.scope.tenantId,
      "json",
    );
    if (!exported.ok) throw new Error("export failed");
    const { memberActivity: rows } = JSON.parse(exported.files[0].content) as {
      memberActivity: { tenantId: string; action: string }[];
    };

    expect(rows).toEqual([
      expect.objectContaining({
        tenantId: tenant.scope.tenantId,
        action: "conversation.taken_over",
      }),
    ]);
  });

  test("is deleted with its Tenant, and only with it", async () => {
    await seedEntry();
    await createHandoffControls({
      db,
      clock: other.clock,
      notifier: createTestNotifier(),
    }).takeOver(other.scope, (await startConversation(other, "5511999990009")).id);
    await db
      .update(organization)
      .set({ canceledAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(organization.id, tenant.scope.tenantId));

    await pruneCanceledTenants(db, tenant.clock);

    expect(await db.$count(organization, eq(organization.id, tenant.scope.tenantId))).toBe(0);
    expect(await entries(tenant.scope.tenantId)).toEqual([]);
    expect(await entries(other.scope.tenantId)).toHaveLength(1);
  });
});
