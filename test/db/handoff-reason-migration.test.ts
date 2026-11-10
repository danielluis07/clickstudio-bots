import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { botTurnRecord, channel, conversation, organization } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { recordInboundTextMessage } from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";

let db: Database;
let conversationId: string;
const statements = (name: string) =>
  readFileSync(`${import.meta.dir}/../../drizzle/${name}/migration.sql`, "utf8").split(
    "--> statement-breakpoint",
  );
// The migration that drops the guard still calls the mapping function, which the
// fully migrated test database no longer has: recreate it from #173's migration.
const [createMapping] = statements("20261110190333_english_handoff_reasons");
const dropGuard = statements("20261110192407_drop_english_handoff_reason_guard");
const runMigration = () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(createMapping));
    for (const statement of dropGuard) await tx.execute(sql.raw(statement));
  });

const legacy = {
  sem_resposta: "no_answer",
  pedido_do_contato: "contact_request",
  regra_do_negocio: "handoff_topic",
  bot_indisponivel: "bot_unavailable",
  limite_atingido: "allowance_exhausted",
  limite_do_contato: "contact_cap_reached",
};

const setConversationReason = (reason: string | null) =>
  db.execute(sql`update conversation set handoff_reason = ${reason} where id = ${conversationId}`);
const conversationReason = async (): Promise<string | null> =>
  (await db.select({ reason: conversation.handoffReason }).from(conversation))[0].reason;
const addTurnRecord = (reason: string) =>
  db.execute(sql`
    insert into bot_turn_record (id, tenant_id, at, outcome, handoff_reason, input_tokens,
      output_tokens, cache_read_tokens, cache_write_tokens, tool_round_trips, duration_ms)
    values (gen_random_uuid()::text, 'tenant', now(), 'handoff', ${reason}, 0, 0, 0, 0, 0, 0)`);
const turnReasons = async () =>
  (
    await db
      .select({ reason: botTurnRecord.handoffReason })
      .from(botTurnRecord)
      .orderBy(botTurnRecord.handoffReason)
  ).map((row): string | null => row.reason);
const guardObjects = async () => [
  ...(await queryTestDatabase<{ name: string }>(
    db,
    "select proname as name from pg_proc where proname like 'english_handoff_reason%'",
  )),
  ...(await queryTestDatabase<{ name: string }>(
    db,
    "select tgname as name from pg_trigger where tgname like '%english_handoff_reason'",
  )),
];

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(organization).values({ id: "tenant", name: "Tenant", slug: "tenant" });
  await db.insert(channel).values({
    id: "channel",
    tenantId: "tenant",
    wabaId: "200",
    phoneNumberId: "300",
    displayPhoneNumber: "+5511999990000",
    credential: { keyVersion: "v1", iv: "", ciphertext: "", tag: "" },
    subscriptionFields: [],
  });
  const recorded = await recordInboundTextMessage(
    db,
    (await resolveChannelPhoneNumber(db, "300"))!,
    {
      wamid: "wamid.1",
      from: "5511988887777",
      profileName: null,
      text: "Oi",
      sentAt: new Date(),
    },
  );
  if (!recorded) throw new Error("The inbound message was not recorded");
  conversationId = recorded;
});
afterEach(() => closeTestDatabase(db));

test("the guard is gone, so a Portuguese reason is stored as written", async () => {
  expect(await guardObjects()).toEqual([]);
  await setConversationReason("assumida");
  expect(await conversationReason()).toBe("assumida");
});

test("the migration renames every stored Portuguese reason and leaves no guard", async () => {
  await setConversationReason("resposta_no_painel");
  for (const old of Object.keys(legacy)) await addTurnRecord(old);
  await addTurnRecord("claimed");

  await runMigration();

  expect(await conversationReason()).toBe("dashboard_reply");
  expect(await turnReasons()).toEqual([...Object.values(legacy), "claimed"].sort());
  expect(await guardObjects()).toEqual([]);
});

test("the migration leaves a cleared reason cleared", async () => {
  await setConversationReason(null);
  await runMigration();
  expect(await conversationReason()).toBeNull();
});
