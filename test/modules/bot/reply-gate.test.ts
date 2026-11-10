import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, conversation, message } from "@/db/schema";
import {
  contactCapDayStart,
  createBotSettingsEditor,
  createReplyGate,
  dailyContactReplyLimit,
  type ReplyCheckpoint,
  type ReplyDecision,
} from "@/modules/bot";
import { createHandoffControls, recordInboundTextMessage } from "@/modules/conversations";
import { createTestNotifier } from "@/test/support/notifier";
import { createTestBotAllowance, testBehaviour } from "@/test/support/bot";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

// An activated Channel with one live Contact message, set directly rather than
// through the activation checklist.
const setup = async () => {
  db = await createTestDatabase();
  const { scope, route, clock } = await seedLiveBot(db);
  await db.update(channel).set({ botEnabled: true }).where(eq(channel.id, route.channelId));
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: "5511999990001",
    profileName: "Ana",
    text: "Quanto custa?",
    sentAt: clock.now(),
  }))!;
  const state = { allowed: true };
  const gate = createReplyGate({
    db,
    clock,
    allowance: createTestBotAllowance(async () => state.allowed),
  });
  const turn = { scope: route, conversationId };
  return {
    clock,
    scope,
    route,
    conversationId,
    state,
    // Bot replies to the turn's Contact, or to another Conversation's.
    botReplies: (
      count: number,
      sentAt: Date,
      { status = "sent", to = conversationId }: { status?: "sent" | "failed"; to?: string } = {},
    ) =>
      db.insert(message).values(
        Array.from({ length: count }, () => ({
          tenantId: route.tenantId,
          conversationId: to,
          direction: "outbound" as const,
          origin: "bot" as const,
          type: "text" as const,
          text: "R$ 80.",
          status,
          wamid: status === "sent" ? crypto.randomUUID() : null,
          sentAt,
        })),
      ),
    checkFor: (conversationId: string, checkpoint: ReplyCheckpoint) =>
      gate.check({ scope: route, conversationId }, checkpoint),
    check: (checkpoint: ReplyCheckpoint, available = true) =>
      gate.check(turn, checkpoint, available),
    setChannel: (values: Partial<typeof channel.$inferInsert>) =>
      db.update(channel).set(values).where(eq(channel.id, route.channelId)),
    withTeam: () =>
      db
        .update(conversation)
        .set({ owner: "team", handoffReason: "claimed", waiting: true })
        .where(eq(conversation.id, conversationId)),
    // Thursday 09:00 in São Paulo is within testBehaviour's Business hours.
    outsideSchedule: () =>
      createBotSettingsEditor({ db, clock }).saveSettings(scope, {
        ...testBehaviour,
        schedule: "outside_business_hours",
      }),
  };
};

const replyCheckpoints = ["beforeModel", "beforeSend"] as const;
const skip: ReplyDecision = { kind: "skip" };
const limit: ReplyDecision = { kind: "handoff", reason: "allowance_exhausted" };
const unavailable: ReplyDecision = { kind: "handoff", reason: "bot_unavailable" };
const contactLimit: ReplyDecision = { kind: "handoff", reason: "contact_cap_reached" };

describe("reply gate", () => {
  test("an eligible Conversation in its service window may reply", async () => {
    const { check } = await setup();
    for (const checkpoint of ["enqueue", ...replyCheckpoints] as const)
      expect(await check(checkpoint)).toEqual({ kind: "reply" });
  });

  test("an inactive, paused or unsubscribed Channel, or a Conversation with the team, skips at every checkpoint", async () => {
    const fixture = await setup();
    const cases = [
      () => fixture.setChannel({ botEnabled: false }),
      () => fixture.setChannel({ botPaused: true }),
      () => fixture.setChannel({ subscriptionStatus: "failed" }),
      fixture.withTeam,
    ];
    for (const apply of cases) {
      await apply();
      // Even with nothing else allowing a reply.
      fixture.state.allowed = false;
      for (const checkpoint of ["enqueue", ...replyCheckpoints] as const)
        expect(await fixture.check(checkpoint, false)).toEqual(skip);
      await fixture.setChannel({
        botEnabled: true,
        botPaused: false,
        subscriptionStatus: "subscribed",
      });
      await db.update(conversation).set({ owner: "bot", handoffReason: null, waiting: false });
      fixture.state.allowed = true;
    }
  });

  test("enqueue checks eligibility only, so an exhausted allowance still runs a turn that hands off", async () => {
    const { clock, state, check, outsideSchedule } = await setup();
    state.allowed = false;
    await outsideSchedule();
    clock.advance(25 * 3_600_000);
    expect(await check("enqueue", false)).toEqual({ kind: "reply" });
  });

  test("a closed service window skips before the allowance hands off", async () => {
    const { clock, state, check } = await setup();
    clock.advance(24 * 3_600_000);
    state.allowed = false;
    for (const checkpoint of replyCheckpoints) expect(await check(checkpoint)).toEqual(skip);
  });

  test("exhaustion hands off even while Schedule pauses replies", async () => {
    const { state, check, outsideSchedule } = await setup();
    await outsideSchedule();
    state.allowed = false;
    for (const checkpoint of replyCheckpoints)
      expect(await check(checkpoint, false)).toEqual(limit);
  });

  test("outside Schedule, an unavailable Model or sender skips without Handoff", async () => {
    const { check, outsideSchedule } = await setup();
    await outsideSchedule();
    for (const checkpoint of replyCheckpoints) expect(await check(checkpoint, false)).toEqual(skip);
  });

  test("an unavailable Model or sender hands off once everything else allows a reply", async () => {
    const { check } = await setup();
    for (const checkpoint of replyCheckpoints)
      expect(await check(checkpoint, false)).toEqual(unavailable);
  });

  test("each check reads the state saved now", async () => {
    const { check, setChannel, outsideSchedule } = await setup();
    expect(await check("beforeModel")).toEqual({ kind: "reply" });
    await outsideSchedule();
    expect(await check("beforeSend")).toEqual(skip);
    await setChannel({ botPaused: true });
    expect(await check("beforeSend", false)).toEqual(skip);
  });
});

describe("daily reply cap per Contact", () => {
  test("is 30 Bot replies", () => {
    expect(dailyContactReplyLimit).toBe(30);
  });

  test("a Contact's 30th Bot reply today hands off at every reply checkpoint, even outside the Schedule", async () => {
    const { clock, botReplies, check, outsideSchedule } = await setup();
    await botReplies(29, clock.now());
    for (const checkpoint of replyCheckpoints)
      expect(await check(checkpoint)).toEqual({ kind: "reply" });
    await botReplies(1, clock.now());
    // A turn still runs, so it can hand off.
    expect(await check("enqueue")).toEqual({ kind: "reply" });
    for (const checkpoint of replyCheckpoints) {
      expect(await check(checkpoint)).toEqual(contactLimit);
      expect(await check(checkpoint, false)).toEqual(contactLimit);
    }
    await outsideSchedule();
    for (const checkpoint of replyCheckpoints)
      expect(await check(checkpoint)).toEqual(contactLimit);
  });

  test("the Tenant's exhausted allowance is reported before the Contact's cap", async () => {
    const { clock, state, botReplies, check } = await setup();
    await botReplies(30, clock.now());
    state.allowed = false;
    for (const checkpoint of replyCheckpoints) expect(await check(checkpoint)).toEqual(limit);
  });

  test("other Contacts of the same Tenant are still answered", async () => {
    const { clock, route, botReplies, check, checkFor } = await setup();
    await botReplies(30, clock.now());
    const other = (await recordInboundTextMessage(db, route, {
      wamid: crypto.randomUUID(),
      from: "5511999990002",
      profileName: null,
      text: "Preço?",
      sentAt: clock.now(),
    }))!;
    expect(await check("beforeModel")).toEqual(contactLimit);
    for (const checkpoint of replyCheckpoints)
      expect(await checkFor(other, checkpoint)).toEqual({ kind: "reply" });
  });

  test("failed sends and yesterday's replies in São Paulo time do not count", async () => {
    const { botReplies, check } = await setup();
    // 09:00 in São Paulo on 2026-10-22; the day began at 03:00 UTC.
    const midnight = new Date("2026-10-22T03:00:00Z");
    await botReplies(30, new Date(midnight.getTime() - 1_000));
    await botReplies(30, midnight, { status: "failed" });
    await botReplies(29, midnight);
    expect(await check("beforeModel")).toEqual({ kind: "reply" });
    await botReplies(1, midnight);
    expect(await check("beforeModel")).toEqual(contactLimit);
  });

  test("the cap resets at midnight in São Paulo, not UTC", async () => {
    const { clock, botReplies, check } = await setup();
    await botReplies(30, clock.now());
    // 23:59 in São Paulo, already the next day in UTC.
    clock.set(new Date("2026-10-23T02:59:00Z"));
    expect(await check("beforeModel")).toEqual(contactLimit);
    clock.set(new Date("2026-10-23T03:00:00Z"));
    expect(await check("beforeModel")).toEqual({ kind: "reply" });
  });

  test("a Member returning the Conversation to the Bot starts a fresh count", async () => {
    const { clock, scope, conversationId, botReplies, check, withTeam } = await setup();
    await botReplies(30, clock.now());
    await withTeam();
    clock.advance(60_000);
    const controls = createHandoffControls({ db, clock, notifier: createTestNotifier() });
    expect(await controls.returnToBot(scope, conversationId)).toEqual({ ok: true });
    expect(await check("beforeModel")).toEqual({ kind: "reply" });
    clock.advance(60_000);
    await botReplies(30, clock.now());
    expect(await check("beforeModel")).toEqual(contactLimit);
  });

  test("the day starts at São Paulo midnight", () => {
    expect(contactCapDayStart(new Date("2026-10-22T12:00:00Z"))).toEqual(
      new Date("2026-10-22T03:00:00Z"),
    );
    expect(contactCapDayStart(new Date("2026-10-23T02:59:59.999Z"))).toEqual(
      new Date("2026-10-22T03:00:00Z"),
    );
    expect(contactCapDayStart(new Date("2026-10-23T03:00:00Z"))).toEqual(
      new Date("2026-10-23T03:00:00Z"),
    );
  });
});
