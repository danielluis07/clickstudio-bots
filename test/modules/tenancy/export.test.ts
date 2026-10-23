import { afterEach, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import { contact, knowledgeBaseEntry, member, user } from "@/db/schema";
import { createTenantExport, createTenantLifecycle } from "@/modules/tenancy";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

test("CSV export during recovery escapes text, neutralizes spreadsheet formulas and stays Tenant-scoped", async () => {
  db = await createTestDatabase();
  const tenant = await seedLiveBot(db);
  const other = await seedLiveBot(db);
  await db
    .insert(user)
    .values({ id: "admin", name: "Admin", email: "admin@example.com", role: "admin" });
  await db.insert(contact).values([
    {
      tenantId: tenant.scope.tenantId,
      phone: "5511999990001",
      name: 'Ana, "Teste"\nSouza',
      need: '=HYPERLINK("https://example.com")',
    },
    { tenantId: other.scope.tenantId, phone: "5511999990002", name: "Foreign contact" },
  ]);
  await createTenantLifecycle({
    db,
    clock: tenant.clock,
    getWhatsApp: () => ({
      subscribe: async () => ({ ok: true as const }),
      unsubscribe: async () => ({ ok: true }),
    }),
  }).cancel("admin", tenant.scope.tenantId);
  const result = await createTenantExport({ db, clock: tenant.clock }).export(
    "admin",
    tenant.scope.tenantId,
    "csv",
  );
  if (!result.ok) throw new Error("Export failed");
  const contacts = result.files.find((file) => file.filename === "contacts.csv")!;
  expect(contacts.content).toContain('"Ana, ""Teste""\nSouza"');
  expect(contacts.content).toContain('"\'=HYPERLINK(""https://example.com"")"');
  expect(contacts.content).toContain('"phone"');
  expect(result.files.some((file) => file.filename === "knowledgeBase.csv")).toBe(true);
  const content = result.files.map((file) => file.content).join("\n");
  expect(content).not.toContain("Foreign contact");
  expect(content).not.toContain(other.scope.tenantId);
  expect(content).not.toContain("credential");
});

test("administrator JSON export contains one Tenant's product data without credentials or foreign memberships", async () => {
  db = await createTestDatabase();
  const tenant = await seedLiveBot(db);
  const other = await seedLiveBot(db);
  await db
    .insert(user)
    .values({ id: "admin", name: "Admin", email: "admin@example.com", role: "admin" });
  await db
    .insert(member)
    .values({ organizationId: other.scope.tenantId, userId: tenant.scope.userId });
  await db.insert(contact).values([
    {
      tenantId: tenant.scope.tenantId,
      phone: "5511999990001",
      name: "Ana",
      email: "ana@example.com",
      city: "São Paulo",
      need: "Horários",
    },
    { tenantId: other.scope.tenantId, phone: "5511999990002", name: "Foreign contact" },
  ]);
  await db.insert(knowledgeBaseEntry).values({
    tenantId: tenant.scope.tenantId,
    kind: "faq",
    title: "Preço?",
    body: "R$ 80",
    createdAt: tenant.clock.now(),
    updatedAt: tenant.clock.now(),
  });
  const exporter = createTenantExport({ db, clock: tenant.clock });
  expect(await exporter.export(tenant.scope.userId, tenant.scope.tenantId, "json")).toEqual({
    ok: false,
    error: "forbidden",
  });
  const result = await exporter.export("admin", tenant.scope.tenantId, "json");
  if (!result.ok) throw new Error("Export failed");
  expect(result.files).toHaveLength(1);
  const content = result.files[0].content;
  const data = JSON.parse(content);
  expect(data.tenant).toMatchObject({ id: tenant.scope.tenantId });
  expect(data.contacts).toMatchObject([{ name: "Ana", city: "São Paulo", need: "Horários" }]);
  expect(data.knowledgeBase).toMatchObject([{ title: "Preço?", body: "R$ 80" }]);
  expect(data.members).toHaveLength(1);
  expect(content).not.toContain(other.scope.tenantId);
  expect(content).not.toContain("Foreign contact");
  expect(content).not.toContain("credential");
  expect(content).not.toContain("ciphertext");
  expect(content).not.toContain("lifecycleToken");
  expect(await exporter.export("admin", "missing", "json")).toEqual({
    ok: false,
    error: "not_found",
  });
});
