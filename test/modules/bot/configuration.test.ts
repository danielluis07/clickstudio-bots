import { afterEach, beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, member, organization, user } from "@/db/schema";
import {
  createBotSettingsEditor,
  createCaptureSettingsEditor,
  createLinkSettingsEditor,
  disabledCapture,
  disabledLinks,
  readBotConfiguration,
  type BotConfiguration,
} from "@/modules/bot";
import { resolveChannelPhoneNumber, type ChannelRoute } from "@/modules/channels";
import { createKnowledgeBaseEditor } from "@/modules/knowledge-base";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { testBehaviour } from "@/test/support/bot";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
let ownerA: TenantScope;
let attendantA: TenantScope;
let ownerB: TenantScope;
let routeA: ChannelRoute;
const clock = createTestClock(new Date("2026-10-22T15:00:00Z"));
const configuration: BotConfiguration = {
  behaviour: testBehaviour,
  knowledgeBase: {
    faqs: [{ question: "Quanto custa o corte?", answer: "R$ 80." }],
    sections: [{ title: "Pagamento", body: "Aceitamos PIX." }],
  },
  capture: {
    enabled: true,
    fields: { name: "required", email: "optional", city: "off", need: "off" },
  },
  links: {
    enabled: true,
    links: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        label: "Reservas",
        url: "https://example.com/reservas",
      },
    ],
  },
};

beforeEach(async () => {
  db = await createTestDatabase();
  clock.set(new Date("2026-10-22T15:00:00Z"));
  for (const [tenantId, members] of [
    [
      "tenant-a",
      [
        ["owner-a", "owner"],
        ["attendant-a", "member"],
      ],
    ],
    ["tenant-b", [["owner-b", "owner"]]],
  ] as const) {
    await db.insert(organization).values({ id: tenantId, name: tenantId, slug: tenantId });
    for (const [id, role] of members) {
      await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
      await db.insert(member).values({ organizationId: tenantId, userId: id, role });
    }
  }
  ownerA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  attendantA = (await resolveTenantScope(db, { userId: "attendant-a" }))!;
  ownerB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
  await db.insert(channel).values({
    id: "channel-a",
    tenantId: ownerA.tenantId,
    wabaId: "201",
    phoneNumberId: "301",
    displayPhoneNumber: "+55 11 99999-0001",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
    subscriptionFields: [],
  });
  routeA = (await resolveChannelPhoneNumber(db, "301"))!;
});

afterEach(() => closeTestDatabase(db));

const saveConfiguration = async (scope: TenantScope) => {
  expect(
    await createBotSettingsEditor({ db, clock }).saveSettings(scope, configuration.behaviour),
  ).toEqual({ ok: true });
  expect(
    await createCaptureSettingsEditor({ db, clock }).saveCapture(scope, configuration.capture),
  ).toEqual({ ok: true });
  expect(
    await createLinkSettingsEditor({ db, clock }).saveLinks(scope, configuration.links),
  ).toEqual({ ok: true });
  const knowledge = createKnowledgeBaseEditor({ db, clock });
  for (const { question, answer } of configuration.knowledgeBase.faqs) {
    expect(
      await knowledge.addEntry(scope, { kind: "faq", title: question, body: answer }),
    ).toMatchObject({ ok: true });
  }
  for (const { title, body } of configuration.knowledgeBase.sections) {
    expect(await knowledge.addEntry(scope, { kind: "section", title, body })).toMatchObject({
      ok: true,
    });
  }
};

test("configuration supplies the Tenant's defaults before any settings are saved", async () => {
  const defaults = await readBotConfiguration(db, ownerA);
  expect(defaults).toMatchObject({
    behaviour: { businessName: "tenant-a", schedule: "always", tone: "neutral" },
    knowledgeBase: { faqs: [], sections: [] },
    capture: disabledCapture,
    links: disabledLinks,
  });
  expect(await readBotConfiguration(db, routeA)).toEqual(defaults);
  expect(await createCaptureSettingsEditor({ db, clock }).getCapture(attendantA)).toEqual({
    settings: disabledCapture,
    updatedAt: null,
    updatedBy: null,
  });
  expect(await createLinkSettingsEditor({ db, clock }).getLinks(attendantA)).toEqual({
    settings: disabledLinks,
    updatedAt: null,
    updatedBy: null,
  });
});

test("Member and Channel proofs read the same saved configuration, isolated from other Tenants and refreshed after edits", async () => {
  await saveConfiguration(ownerA);
  for (const scope of [ownerA, attendantA, routeA]) {
    expect(await readBotConfiguration(db, scope)).toEqual(configuration);
  }
  const other = await readBotConfiguration(db, ownerB);
  expect(other).toMatchObject({
    behaviour: { businessName: "tenant-b" },
    knowledgeBase: { faqs: [], sections: [] },
    capture: disabledCapture,
    links: disabledLinks,
  });

  await createBotSettingsEditor({ db, clock }).saveSettings(ownerA, {
    ...configuration.behaviour,
    tone: "formal",
  });
  await createCaptureSettingsEditor({ db, clock }).saveCapture(ownerA, {
    ...configuration.capture,
    enabled: false,
  });
  await createLinkSettingsEditor({ db, clock }).saveLinks(ownerA, {
    ...configuration.links,
    enabled: false,
  });
  const knowledge = createKnowledgeBaseEditor({ db, clock });
  const { entries } = await knowledge.getKnowledgeBase(ownerA);
  const faq = entries.find(({ kind }) => kind === "faq")!;
  await knowledge.editEntry(ownerA, faq.id, { title: faq.title, body: "R$ 90." });

  expect(await readBotConfiguration(db, routeA)).toEqual({
    behaviour: { ...configuration.behaviour, tone: "formal" },
    knowledgeBase: {
      ...configuration.knowledgeBase,
      faqs: [{ question: faq.title, answer: "R$ 90." }],
    },
    capture: { ...configuration.capture, enabled: false },
    links: { ...configuration.links, enabled: false },
  });
  expect(await readBotConfiguration(db, ownerB)).toEqual(other);
});

test("removing the saving Member retains all settings and timestamps with no editor attribution", async () => {
  await saveConfiguration(ownerA);
  const updatedAt = clock.now();
  clock.advance(60_000);
  await db.delete(member).where(eq(member.id, ownerA.memberId));

  const editors = [
    await createBotSettingsEditor({ db, clock }).getSettings(attendantA),
    await createCaptureSettingsEditor({ db, clock }).getCapture(attendantA),
    await createLinkSettingsEditor({ db, clock }).getLinks(attendantA),
  ];
  for (const saved of editors) {
    expect(saved).toMatchObject({ updatedAt, updatedBy: null });
  }
  expect(await readBotConfiguration(db, routeA)).toEqual(configuration);
});
