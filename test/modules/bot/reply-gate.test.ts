import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel, conversation } from "@/db/schema";
import {
  createBotSettingsEditor,
  createReplyGate,
  type ReplyCheckpoint,
  type ReplyDecision,
} from "@/modules/bot";
import { recordInboundTextMessage } from "@/modules/conversations";
import { testBehaviour } from "@/test/support/bot";
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
  const gate = createReplyGate({ db, clock, allowance: { canReply: async () => state.allowed } });
  const turn = { scope: route, conversationId };
  return {
    clock,
    state,
    check: (checkpoint: ReplyCheckpoint, available = true) =>
      gate.check(turn, checkpoint, available),
    setChannel: (values: Partial<typeof channel.$inferInsert>) =>
      db.update(channel).set(values).where(eq(channel.id, route.channelId)),
    withTeam: () =>
      db
        .update(conversation)
        .set({ owner: "team", handoffReason: "assumida", waiting: true })
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
const limit: ReplyDecision = { kind: "handoff", reason: "limite_atingido" };
const unavailable: ReplyDecision = { kind: "handoff", reason: "bot_indisponivel" };

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
