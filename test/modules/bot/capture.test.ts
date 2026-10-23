import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import {
  createCaptureSettingsEditor,
  readBotConfiguration,
  type CaptureSettings,
} from "@/modules/bot";
import { resolveTenantScope, type TenantScope } from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
let ownerA: TenantScope;
let attendantA: TenantScope;
let ownerB: TenantScope;
const clock = createTestClock(new Date("2026-10-22T15:00:00Z"));
let editor: ReturnType<typeof createCaptureSettingsEditor>;

const nameAndEmail: CaptureSettings = {
  enabled: true,
  fields: { name: "required", email: "optional", city: "off", need: "required" },
};

beforeEach(async () => {
  db = await createTestDatabase();
  editor = createCaptureSettingsEditor({ db, clock });
  for (const [tenant, users] of [
    [
      "tenant-a",
      [
        ["owner-a", "owner"],
        ["attendant-a", "member"],
      ],
    ],
    ["tenant-b", [["owner-b", "owner"]]],
  ] as const) {
    await db.insert(organization).values({ id: tenant, name: tenant, slug: tenant });
    for (const [userId, role] of users) {
      await db.insert(user).values({ id: userId, name: userId, email: `${userId}@example.com` });
      await db.insert(member).values({ organizationId: tenant, userId, role });
    }
  }
  ownerA = (await resolveTenantScope(db, { userId: "owner-a" }))!;
  attendantA = (await resolveTenantScope(db, { userId: "attendant-a" }))!;
  ownerB = (await resolveTenantScope(db, { userId: "owner-b" }))!;
});

afterEach(() => closeTestDatabase(db));

test("capture is disabled, with every field off, until the owner saves", async () => {
  expect((await readBotConfiguration(db, ownerA)).capture).toEqual({
    enabled: false,
    fields: { name: "off", email: "off", city: "off", need: "off" },
  });
});

test("the owner chooses the fields and which are required, for their Tenant only", async () => {
  expect(await editor.saveCapture(ownerA, nameAndEmail)).toEqual({ ok: true });

  expect((await readBotConfiguration(db, ownerA)).capture).toEqual(nameAndEmail);
  expect(await editor.getCapture(attendantA)).toMatchObject({
    settings: nameAndEmail,
    updatedAt: clock.now(),
    updatedBy: "owner-a",
  });
  expect((await readBotConfiguration(db, ownerB)).capture.enabled).toBe(false);
});

test("the owner can disable capture and keep the field choices for later", async () => {
  await editor.saveCapture(ownerA, nameAndEmail);
  await editor.saveCapture(ownerA, { ...nameAndEmail, enabled: false });

  expect((await readBotConfiguration(db, ownerA)).capture).toEqual({
    ...nameAndEmail,
    enabled: false,
  });
});

test("other Members cannot change capture", async () => {
  expect(await editor.saveCapture(attendantA, nameAndEmail)).toEqual({
    ok: false,
    error: "forbidden",
  });
  expect((await readBotConfiguration(db, ownerA)).capture.enabled).toBe(false);
});

test.each([
  [
    "enabled with every field off",
    { enabled: true, fields: { name: "off", email: "off", city: "off", need: "off" } },
  ],
  ["an unknown mode", { enabled: true, fields: { ...nameAndEmail.fields, city: "always" } }],
  [
    "a field outside the catalog",
    { enabled: true, fields: { ...nameAndEmail.fields, cpf: "required" } },
  ],
  ["a missing field", { enabled: true, fields: { name: "required", email: "off", city: "off" } }],
])("refuses %s", async (_case, input) => {
  expect(await editor.saveCapture(ownerA, input as CaptureSettings)).toEqual({
    ok: false,
    error: "invalid",
  });
  expect((await readBotConfiguration(db, ownerA)).capture.enabled).toBe(false);
});
