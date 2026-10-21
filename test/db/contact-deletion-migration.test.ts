import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, member, messageChange, organization, user } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { createConversationRepository, deleteContact, recordInboundTextMessage } from "@/modules/conversations";
import { resolveTenantScope } from "@/modules/tenancy";
import { createWebhookInbox } from "@/modules/webhook-inbox";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { createTestJobQueue } from "@/test/support/job-queue";
import { createTestNotifier } from "@/test/support/notifier";
import { metaAppSecret, metaDelivery, referencingChange, signMetaDelivery } from "@/test/support/meta-webhook";

let db: Database;
const clock = createTestClock(new Date("2026-10-21T12:00:00Z"));
const notifier = createTestNotifier();
const migration = readFileSync(`${import.meta.dir}/../../drizzle/20261021231904_message_change_erasure/migration.sql`, "utf8");
const migrateChanges = () => db.transaction(async (tx) => {
  for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
});

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.com" });
  await db.insert(organization).values({ id: "tenant", name: "Tenant", slug: "tenant" });
  await db.insert(member).values({ organizationId: "tenant", userId: "owner", role: "owner" });
  await db.insert(channel).values({
    id: "channel", tenantId: "tenant", wabaId: "200", phoneNumberId: "300", displayPhoneNumber: "+5511999990000",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" }, subscriptionFields: [],
  });
});
afterEach(() => closeTestDatabase(db));

const addLegacyChange = (originalWamid: string, direction: "inbound" | "outbound" = "inbound") => db.insert(messageChange).values({
  tenantId: "tenant", wamid: "wamid.legacy-edit", originalWamid, direction, kind: "edit", text: "Dados antigos",
  changedAt: clock.now(), contactAddressHash: "discarded-to-reproduce-legacy-schema",
});
const useLegacySchema = () => db.execute(sql`alter table message_change drop column contact_address_hash`);

test("legacy changes with a filed original are backfilled and erased with the Contact", async () => {
  const route = (await resolveChannelPhoneNumber(db, "300"))!;
  const conversationId = await recordInboundTextMessage(db, route, {
    wamid: "wamid.original", from: "5511988887777", profileName: null, text: "Original", sentAt: clock.now(),
  });
  await addLegacyChange("wamid.original");
  await useLegacySchema();
  await migrateChanges();
  const scope = (await resolveTenantScope(db, { userId: "owner" }))!;
  const found = (await createConversationRepository(db, scope).getConversation(conversationId!))!;
  expect(await deleteContact({ db, scope, clock, notifier, contactId: found.contact.id })).toEqual({ ok: true });
  expect(await db.select().from(messageChange)).toEqual([]);
});

test.each(["contact", "app"] as const)("a legacy orphan edit from %s is attributed through its retained inbox event", async (by) => {
  const queue = createTestJobQueue();
  const inbox = createWebhookInbox({ db, clock, notifier, queue, appSecret: metaAppSecret });
  const change = referencingChange({ phoneNumberId: "300", wamid: "wamid.legacy-edit", originalWamid: "wamid.missing", type: "edit", by });
  // Meta also represents app recipients with a leading '+'.
  if ("message_echoes" in change.value && change.value.message_echoes) change.value.message_echoes[0].to = "+5511988887777";
  const body = metaDelivery(change);
  await inbox.receive({ body, signature: signMetaDelivery(body) });
  await addLegacyChange("wamid.missing", by === "contact" ? "inbound" : "outbound");
  await useLegacySchema();
  await migrateChanges();
  const [backfilled] = await db.select().from(messageChange);
  expect(backfilled.contactAddressHash).toMatch(/^[a-f0-9]{64}$/);
  const route = (await resolveChannelPhoneNumber(db, "300"))!;
  const conversationId = await recordInboundTextMessage(db, route, {
    wamid: "wamid.new-original", from: "5511988887777", profileName: null, text: "Original", sentAt: clock.now(),
  });
  const scope = (await resolveTenantScope(db, { userId: "owner" }))!;
  const found = (await createConversationRepository(db, scope).getConversation(conversationId!))!;
  expect(await deleteContact({ db, scope, clock, notifier, contactId: found.contact.id })).toEqual({ ok: true });
  expect(await db.select().from(messageChange)).toEqual([]);
});

test("migration refuses an unattributable legacy edit without deleting its content", async () => {
  await addLegacyChange("wamid.no-original-or-inbox");
  await useLegacySchema();
  await expect(migrateChanges()).rejects.toThrow();
  const [retained] = await db.select({ text: messageChange.text }).from(messageChange).where(eq(messageChange.wamid, "wamid.legacy-edit"));
  expect(retained.text).toBe("Dados antigos");
});
