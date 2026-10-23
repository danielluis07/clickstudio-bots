import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import {
  botSettingsLimits,
  createBotCore,
  createBotSettingsEditor,
  readBotConfiguration,
  readBehaviour,
  scheduleAllows,
  type BehaviourSettings,
} from "@/modules/bot";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import { createConversationRepository, recordInboundTextMessage } from "@/modules/conversations";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestBotRepository, createTestUsageMeter } from "@/test/support/bot";
import { createTestClock, type TestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestModel } from "@/test/support/model";

let db: Database;
let clock: TestClock;
let editor: ReturnType<typeof createBotSettingsEditor>;
let ownerA: TenantScope;
let routeA: ChannelRoute;

const closedWeek: BehaviourSettings["hours"] = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

const settings: BehaviourSettings = {
  businessName: "Barbearia A",
  offer: "Cortes de cabelo e barba",
  address: "Rua das Flores, 100",
  hours: {
    ...closedWeek,
    tuesday: { opens: "09:00", closes: "19:00" },
    saturday: { opens: "08:30", closes: "13:00" },
  },
  tone: "formal",
  emoji: true,
  greeting: "Olá! Aqui é a Barbearia A.",
  rules: "Não confirme agendamentos.",
  refusedTopics: ["política"],
  handoffTopics: ["reclamações", "reembolsos"],
  schedule: "outside_business_hours",
};

const scopeOf = async (userId: string) => {
  const scope = await resolveTenantScope(db, { userId });
  if (!scope) throw new Error("expected a Tenant scope");
  return scope;
};

const saved = async (input: BehaviourSettings, scope = ownerA) => {
  const result = await editor.saveSettings(scope, input);
  if (!result.ok) throw new Error(`setup failed: ${result.error}`);
};

// A Bot core that reads the saved settings, as production does.
const instructionsOfNextTurn = async (scope: TenantScope | ChannelRoute = routeA) => {
  const model = createTestModel();
  model.script({ text: "Olá." });
  const repository = createTestBotRepository();
  repository.messages = [{ author: "contact", text: "Oi", sentAt: clock.now() }];
  repository.getConfiguration = (turn) => readBotConfiguration(db, turn.scope);
  await createBotCore({ model, repository, meter: createTestUsageMeter(), clock }).respond({
    scope,
    conversationId: "conversation-a",
  });
  return model.requests[0].instructions;
};

afterEach(() => closeTestDatabase(db));

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createTestClock(new Date("2026-03-10T12:00:00.000Z"));
  editor = createBotSettingsEditor({ db, clock });
  await db.insert(user).values([
    { id: "owner-a", name: "Dona Ana", email: "ana@a.example" },
    { id: "attendant-a", name: "Bruno Atendente", email: "bruno@a.example" },
    { id: "owner-b", name: "Dono Beto", email: "beto@b.example" },
  ]);
  await db.insert(organization).values([
    { id: "tenant-a", name: "Barbearia A", slug: "a" },
    { id: "tenant-b", name: "Padaria B", slug: "b" },
  ]);
  await db.insert(member).values([
    { organizationId: "tenant-a", userId: "owner-a", role: "owner" },
    { organizationId: "tenant-a", userId: "attendant-a", role: "member" },
    { organizationId: "tenant-b", userId: "owner-b", role: "owner" },
  ]);
  await db.insert(channel).values({
    id: "channel-a",
    tenantId: "tenant-a",
    wabaId: "201",
    phoneNumberId: "301",
    displayPhoneNumber: "+55 11 99999-0001",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
    subscriptionFields: [],
  });
  ownerA = await scopeOf("owner-a");
  routeA = (await resolveChannelPhoneNumber(db, "301"))!;
});

describe("saving the Bot's settings", () => {
  test("the owner saves every setting, which shows when and by whom it was saved", async () => {
    expect(await editor.saveSettings(ownerA, settings)).toEqual({ ok: true });

    expect(await editor.getSettings(ownerA)).toEqual({
      settings,
      updatedAt: new Date("2026-03-10T12:00:00.000Z"),
      updatedBy: "Dona Ana",
    });
  });

  test("before any save, the Bot uses the Tenant's name, a neutral tone and is always on", async () => {
    expect(await editor.getSettings(ownerA)).toEqual({
      settings: {
        businessName: "Barbearia A",
        offer: "",
        address: "",
        hours: closedWeek,
        tone: "neutral",
        emoji: false,
        greeting: "",
        rules: "",
        refusedTopics: [],
        handoffTopics: [],
        schedule: "always",
      },
      updatedAt: null,
      updatedBy: null,
    });
  });

  test("a later save replaces the earlier one", async () => {
    await saved(settings);
    clock.advance(60_000);

    await saved({ ...settings, tone: "casual", schedule: "always", handoffTopics: [] });

    expect(await editor.getSettings(ownerA)).toMatchObject({
      settings: { tone: "casual", schedule: "always", handoffTopics: [] },
      updatedAt: new Date("2026-03-10T12:01:00.000Z"),
    });
  });

  test("text is saved trimmed with form line breaks as one, and blank topics are dropped", async () => {
    await saved({
      ...settings,
      businessName: "  Barbearia A  ",
      rules: "Regra 1\r\nRegra 2\r\n",
      refusedTopics: [" política ", "", "  "],
    });

    expect(await editor.getSettings(ownerA)).toMatchObject({
      settings: {
        businessName: "Barbearia A",
        rules: "Regra 1\nRegra 2",
        refusedTopics: ["política"],
      },
    });
  });
});

describe("bounded settings", () => {
  const textFields = ["businessName", "offer", "address", "greeting", "rules"] as const;

  test("each text field accepts up to its documented length, counting accents as one", async () => {
    expect(botSettingsLimits).toEqual({
      businessName: 100,
      offer: 500,
      address: 300,
      greeting: 300,
      rules: 2_000,
      topic: 100,
      topics: 20,
    });
    for (const field of textFields) {
      const atLimit = "é".repeat(botSettingsLimits[field]);
      expect(await editor.saveSettings(ownerA, { ...settings, [field]: atLimit })).toEqual({
        ok: true,
      });
      expect(await editor.saveSettings(ownerA, { ...settings, [field]: `${atLimit}a` })).toEqual({
        ok: false,
        error: "invalid",
      });
    }
  });

  test("topic lists hold up to 20 topics of up to 100 characters each", async () => {
    const topics = Array.from({ length: 20 }, (_, index) => `${index}`.padEnd(100, "x"));
    for (const list of ["refusedTopics", "handoffTopics"] as const) {
      expect(await editor.saveSettings(ownerA, { ...settings, [list]: topics })).toEqual({
        ok: true,
      });
      expect(
        await editor.saveSettings(ownerA, { ...settings, [list]: [...topics, "mais um"] }),
      ).toEqual({ ok: false, error: "invalid" });
      expect(await editor.saveSettings(ownerA, { ...settings, [list]: ["x".repeat(101)] })).toEqual(
        {
          ok: false,
          error: "invalid",
        },
      );
    }
  });

  test("a blank business name, unknown tone or schedule, or malformed hours are refused", async () => {
    await saved(settings);
    const tuesday = (opens: string, closes: string) => ({
      ...settings,
      hours: { ...settings.hours, tuesday: { opens, closes } },
    });

    for (const input of [
      { ...settings, businessName: "  " },
      { ...settings, tone: "rude" },
      { ...settings, schedule: "weekends" },
      tuesday("9:00", "19:00"),
      tuesday("09:00", "24:00"),
      tuesday("19:00", "09:00"),
      tuesday("09:00", "09:00"),
      { ...settings, hours: { ...settings.hours, holiday: null } },
    ]) {
      expect(await editor.saveSettings(ownerA, input as BehaviourSettings)).toEqual({
        ok: false,
        error: "invalid",
      });
    }
    expect((await editor.getSettings(ownerA)).settings).toEqual(settings);
  });

  test("outside business hours only needs at least one open day", async () => {
    expect(
      await editor.saveSettings(ownerA, {
        ...settings,
        hours: closedWeek,
        schedule: "outside_business_hours",
      }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(
      await editor.saveSettings(ownerA, { ...settings, hours: closedWeek, schedule: "always" }),
    ).toEqual({ ok: true });
  });
});

describe("what the Bot reads", () => {
  test("the next turn's instructions use the settings saved now, for the turn's Tenant only", async () => {
    await saved(
      { ...settings, businessName: "Padaria B", greeting: "Oi da padaria" },
      await scopeOf("owner-b"),
    );
    await saved(settings);

    const live = await instructionsOfNextTurn(routeA);
    expect(live).toContain("Name: Barbearia A");
    expect(live).toContain("Tone: formal and polite.");
    expect(live).toContain("Emoji: allowed, sparingly.");
    expect(live).toContain(
      "Greeting to use when a Contact first writes: Olá! Aqui é a Barbearia A.",
    );
    expect(live).toContain("- Saturday: 08:30 to 13:00");
    expect(live).toContain("Topics handed to the team: reclamações; reembolsos");
    expect(live).not.toContain("Padaria");
    expect(await instructionsOfNextTurn(ownerA)).toBe(live);

    await saved({ ...settings, tone: "casual", emoji: false });
    const after = await instructionsOfNextTurn(routeA);
    expect(after).toContain("Tone: casual and warm.");
    expect(after).toContain("Emoji: never use them.");
  });

  test("the schedule saved now decides eligibility, in São Paulo time", async () => {
    await saved(settings);
    const isScheduled = async () => scheduleAllows(await readBehaviour(db, routeA), clock.now());

    // Tuesday 2026-03-10, 09:00 in São Paulo.
    expect(await isScheduled()).toBe(false);
    await saved({ ...settings, schedule: "always" });
    expect(await isScheduled()).toBe(true);
  });

  test("changing the schedule leaves every Conversation as it was", async () => {
    await saved({ ...settings, schedule: "always" });
    await recordInboundTextMessage(db, routeA, {
      wamid: "wamid.1",
      from: "5511988887777",
      profileName: "Carla",
      text: "Oi",
      sentAt: new Date("2026-03-10T11:59:00.000Z"),
    });
    const inbox = createConversationRepository(db, ownerA);
    const before = await inbox.listConversations();
    clock.advance(60_000);

    await saved(settings);

    expect(await inbox.listConversations()).toEqual(before);
  });
});

describe("who may edit", () => {
  test("other Members read the settings but cannot save them", async () => {
    await saved(settings);
    const attendant = await scopeOf("attendant-a");

    expect(await editor.saveSettings(attendant, { ...settings, schedule: "always" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await editor.getSettings(attendant)).settings).toEqual(settings);
  });

  test("each Tenant reads and saves only its own settings", async () => {
    const ownerB = await scopeOf("owner-b");
    await saved(settings);

    await saved({ ...settings, businessName: "Padaria B", tone: "casual" }, ownerB);

    expect((await editor.getSettings(ownerA)).settings).toEqual(settings);
    expect((await editor.getSettings(ownerB)).settings).toMatchObject({
      businessName: "Padaria B",
      tone: "casual",
    });
  });
});
