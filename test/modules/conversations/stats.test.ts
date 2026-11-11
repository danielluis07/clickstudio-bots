import { afterEach, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { contact, conversation, handoffEvent } from "@/db/schema";
import type { BusinessHours } from "@/modules/bot";
import {
  createConversationStats,
  recordImportedHistory,
  recordInboundTextMessage,
  type ConversationHandoffReason,
} from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const hours: BusinessHours = {
  monday: { opens: "09:00", closes: "18:00" },
  tuesday: { opens: "09:00", closes: "18:00" },
  wednesday: { opens: "09:00", closes: "18:00" },
  thursday: { opens: "09:00", closes: "18:00" },
  friday: { opens: "09:00", closes: "18:00" },
  saturday: null,
  sunday: null,
};

// The clock reads 2026-10-22 09:00 in São Paulo (UTC-3), so the 7-day period
// runs from São Paulo midnight on 2026-10-16, which is 03:00 UTC.
const periodStart = new Date("2026-10-16T03:00:00Z");
const justBefore = new Date(periodStart.getTime() - 1000);

const setup = async () => {
  db = await createTestDatabase();
  const seeded = await seedLiveBot(db);
  const stats = createConversationStats({
    db,
    clock: seeded.clock,
    readBusinessHours: async () => hours,
  });
  let sequence = 0;
  const write = async (phone: string, sentAt: Date, profileName: string | null = null) => {
    await recordInboundTextMessage(db, seeded.route, {
      wamid: `wamid.${++sequence}`,
      from: phone,
      profileName,
      text: "Oi",
      sentAt,
      receivedAt: sentAt,
    });
    return conversationOf(phone);
  };
  const imported = async (phone: string, sentAt: Date) => {
    await recordImportedHistory(db, seeded.route, {
      phone,
      receivedAt: seeded.clock.now(),
      messages: [
        { wamid: `wamid.${++sequence}`, direction: "inbound", status: "read", text: "Oi", sentAt },
      ],
    });
    return conversationOf(phone);
  };
  const conversationOf = async (phone: string) => {
    const [found] = await db
      .select({ id: conversation.id })
      .from(conversation)
      .innerJoin(contact, eq(contact.id, conversation.contactId))
      .where(and(eq(contact.tenantId, seeded.scope.tenantId), eq(contact.phone, phone)));
    return found.id;
  };
  const handedOff = (
    conversationId: string,
    occurredAt: Date,
    reason: ConversationHandoffReason = "contact_request",
  ) =>
    db.insert(handoffEvent).values({
      tenantId: seeded.scope.tenantId,
      conversationId,
      reason,
      actor: "bot",
      occurredAt,
    });
  return { ...seeded, stats, write, imported, handedOff };
};

const days7 = [
  "2026-10-16",
  "2026-10-17",
  "2026-10-18",
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
];

test("a Tenant with no data yet gets every day and hour of the period at zero", async () => {
  const { stats, scope } = await setup();

  const result = await stats.read(scope, 7);

  expect(result).toEqual({
    period: 7,
    activeConversations: 0,
    botOnlyConversations: 0,
    newContacts: 0,
    daily: days7.map((date) => ({ date, botOnly: 0, withHandoff: 0 })),
    contactMessagesByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, messages: 0 })),
    businessHours: hours,
    latestHandoffs: [],
  });
});

test("Active Conversations count Conversations with a live Contact message from São Paulo midnight on the period's first day", async () => {
  const { stats, scope, write, imported } = await setup();
  await write("5511900000001", justBefore);
  await write("5511900000002", periodStart);
  // Two days with messages, one Active Conversation.
  await write("5511900000003", new Date("2026-10-18T15:00:00Z"));
  await write("5511900000003", new Date("2026-10-22T11:00:00Z"));
  // Imported history in the period is not activity.
  await imported("5511900000004", new Date("2026-10-20T15:00:00Z"));

  const result = await stats.read(scope, 7);

  expect(result.activeConversations).toBe(2);
  expect(result.daily.filter((day) => day.botOnly + day.withHandoff > 0)).toEqual([
    { date: "2026-10-16", botOnly: 1, withHandoff: 0 },
    { date: "2026-10-18", botOnly: 1, withHandoff: 0 },
    { date: "2026-10-22", botOnly: 1, withHandoff: 0 },
  ]);
});

test("an Active Conversation counts as only the Bot's unless it had a Handoff in the period, and per day unless it had one that day", async () => {
  const { stats, scope, write, handedOff } = await setup();
  // Handed off just before the period: only the Bot in it.
  const earlier = await write("5511900000001", new Date("2026-10-17T15:00:00Z"));
  await handedOff(earlier, justBefore);
  // Handed off from São Paulo midnight on the first day.
  const atStart = await write("5511900000002", periodStart);
  await handedOff(atStart, periodStart);
  // Active on two days, handed off on the second.
  const later = await write("5511900000003", new Date("2026-10-19T15:00:00Z"));
  await write("5511900000003", new Date("2026-10-21T15:00:00Z"));
  await handedOff(later, new Date("2026-10-21T16:00:00Z"));
  // Claimed by a Member the day after its only message.
  const claimed = await write("5511900000004", new Date("2026-10-19T20:00:00Z"));
  await handedOff(claimed, new Date("2026-10-20T13:00:00Z"), "claimed");

  const result = await stats.read(scope, 7);

  expect(result.activeConversations).toBe(4);
  expect(result.botOnlyConversations).toBe(1);
  expect(result.daily.filter((day) => day.botOnly + day.withHandoff > 0)).toEqual([
    { date: "2026-10-16", botOnly: 0, withHandoff: 1 },
    { date: "2026-10-17", botOnly: 1, withHandoff: 0 },
    { date: "2026-10-19", botOnly: 2, withHandoff: 0 },
    { date: "2026-10-21", botOnly: 0, withHandoff: 1 },
  ]);
});

test("new Contacts are those whose first Contact message arrived live in the period", async () => {
  const { stats, scope, write, imported } = await setup();
  // First wrote from São Paulo midnight on the first day: new.
  await write("5511900000001", periodStart);
  await write("5511900000001", new Date("2026-10-20T15:00:00Z"));
  // First wrote just before the period: not new, though active in it.
  await write("5511900000002", justBefore);
  await write("5511900000002", new Date("2026-10-20T15:00:00Z"));
  // Imported history shows an earlier message: not new.
  await imported("5511900000003", new Date("2026-09-01T15:00:00Z"));
  await write("5511900000003", new Date("2026-10-20T15:00:00Z"));
  // Only imported history in the period: neither new nor active.
  await imported("5511900000004", new Date("2026-10-20T15:00:00Z"));

  const result = await stats.read(scope, 7);

  expect(result.newContacts).toBe(1);
  expect(result.activeConversations).toBe(3);
});

test("Contact messages are counted by São Paulo hour from the period's first midnight, without imported history", async () => {
  const { stats, scope, write, imported } = await setup();
  await write("5511900000001", justBefore);
  await write("5511900000001", periodStart);
  await write("5511900000001", new Date("2026-10-20T15:10:00Z"));
  await write("5511900000002", new Date("2026-10-21T15:50:00Z"));
  await imported("5511900000003", new Date("2026-10-20T15:30:00Z"));

  const result = await stats.read(scope, 7);

  expect(result.contactMessagesByHour.filter((hour) => hour.messages > 0)).toEqual([
    { hour: 0, messages: 1 },
    { hour: 12, messages: 2 },
  ]);
  expect(result.contactMessagesByHour).toHaveLength(24);
});

test("the latest Handoffs are the five newest in the period, with their Contact and reason", async () => {
  const { stats, scope, write, handedOff } = await setup();
  const ana = await write("5511900000001", new Date("2026-10-15T12:00:00Z"), "Ana");
  await handedOff(ana, justBefore);
  await handedOff(ana, periodStart, "no_answer");
  const bruno = await write("5511900000002", new Date("2026-10-17T12:00:00Z"), "Bruno");
  for (const [index, reason] of (
    ["contact_request", "claimed", "handoff_topic", "dashboard_reply", "app_reply"] as const
  ).entries())
    await handedOff(bruno, new Date(Date.UTC(2026, 9, 17 + index, 13)), reason);

  const result = await stats.read(scope, 7);

  expect(
    result.latestHandoffs.map(({ contact, reason, at }) => [contact.profileName, reason, at]),
  ).toEqual([
    ["Bruno", "app_reply", new Date("2026-10-21T13:00:00Z")],
    ["Bruno", "dashboard_reply", new Date("2026-10-20T13:00:00Z")],
    ["Bruno", "handoff_topic", new Date("2026-10-19T13:00:00Z")],
    ["Bruno", "claimed", new Date("2026-10-18T13:00:00Z")],
    ["Bruno", "contact_request", new Date("2026-10-17T13:00:00Z")],
  ]);
  expect(result.latestHandoffs[0]).toEqual({
    conversationId: bruno,
    contact: { name: null, appName: null, profileName: "Bruno", phone: "5511900000002" },
    reason: "app_reply",
    at: new Date("2026-10-21T13:00:00Z"),
  });
});

test("the period-start Handoff is the oldest one shown", async () => {
  const { stats, scope, write, handedOff } = await setup();
  const ana = await write("5511900000001", new Date("2026-10-15T12:00:00Z"), "Ana");
  await handedOff(ana, justBefore, "claimed");
  await handedOff(ana, periodStart, "no_answer");

  const result = await stats.read(scope, 7);

  expect(result.latestHandoffs.map(({ reason, at }) => [reason, at])).toEqual([
    ["no_answer", periodStart],
  ]);
});

test("another Tenant's Conversations and Handoffs count for nothing", async () => {
  const { stats, scope } = await setup();
  const other = await seedLiveBot(db);
  await recordInboundTextMessage(db, other.route, {
    wamid: "wamid.other",
    from: "5511900000009",
    profileName: "Outra",
    text: "Oi",
    sentAt: periodStart,
    receivedAt: periodStart,
  });
  const [otherConversation] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(eq(conversation.tenantId, other.scope.tenantId));
  await db.insert(handoffEvent).values({
    tenantId: other.scope.tenantId,
    conversationId: otherConversation.id,
    reason: "claimed",
    actor: "member",
    occurredAt: periodStart,
  });

  const result = await stats.read(scope, 7);

  expect(result).toMatchObject({
    activeConversations: 0,
    newContacts: 0,
    latestHandoffs: [],
  });
  expect(result.contactMessagesByHour.every((hour) => hour.messages === 0)).toBe(true);
});

test("the period ends with today in São Paulo while UTC is already tomorrow", async () => {
  const { stats, scope, clock, write } = await setup();
  clock.set(new Date("2026-11-12T01:30:00Z"));
  await write("5511900000001", new Date("2026-11-12T01:00:00Z"));

  for (const period of [7, 30, 90] as const) {
    const result = await stats.read(scope, period);
    expect(result.daily).toHaveLength(period);
    expect(result.daily.at(-1)).toEqual({ date: "2026-11-11", botOnly: 1, withHandoff: 0 });
    expect(result.contactMessagesByHour[22]).toEqual({ hour: 22, messages: 1 });
  }
});
