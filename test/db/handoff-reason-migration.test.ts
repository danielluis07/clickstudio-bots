import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { botTurnRecord, channel, conversation, organization } from "@/db/schema";
import { resolveChannelPhoneNumber } from "@/modules/channels";
import { recordInboundTextMessage } from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
let conversationId: string;
const migration = readFileSync(
  `${import.meta.dir}/../../drizzle/20261110190333_english_handoff_reasons/migration.sql`,
  "utf8",
);
const backfill = () =>
  db.transaction(async (tx) => {
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim().startsWith("UPDATE")) await tx.execute(sql.raw(statement));
  });

const legacy = {
  sem_resposta: "no_answer",
  pedido_do_contato: "contact_request",
  regra_do_negocio: "handoff_topic",
  bot_indisponivel: "bot_unavailable",
  limite_atingido: "allowance_exhausted",
  limite_do_contato: "contact_cap_reached",
  assumida: "claimed",
  resposta_no_painel: "dashboard_reply",
  resposta_no_app: "app_reply",
};
const botTurnLegacy = Object.entries(legacy).slice(0, 6);

const setConversationReason = (reason: string) =>
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
const setTriggers = async (state: "enable" | "disable") => {
  for (const table of ["conversation", "bot_turn_record"])
    await db.execute(
      sql.raw(`alter table ${table} ${state} trigger ${table}_english_handoff_reason`),
    );
};

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

test("the migration renames every stored Portuguese reason", async () => {
  await setTriggers("disable");
  await setConversationReason("assumida");
  for (const [old] of botTurnLegacy) await addTurnRecord(old);
  await setTriggers("enable");

  await backfill();

  expect(await conversationReason()).toBe("claimed");
  expect(await turnReasons()).toEqual(botTurnLegacy.map(([, renamed]) => renamed).sort());
});

test("a write from code still on the Portuguese reasons is stored in English", async () => {
  for (const [old, renamed] of Object.entries(legacy)) {
    await setConversationReason(old);
    expect(await conversationReason()).toBe(renamed);
  }
  for (const [old] of botTurnLegacy) await addTurnRecord(old);
  expect(await turnReasons()).toEqual(botTurnLegacy.map(([, renamed]) => renamed).sort());
});

test("English reasons and a cleared reason are left as they are", async () => {
  await setConversationReason("bot_unavailable");
  expect(await conversationReason()).toBe("bot_unavailable");
  await db.execute(sql`update conversation set handoff_reason = null`);
  expect(await conversationReason()).toBeNull();
});
