import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { channel } from "@/db/schema";
import { recordInboundTextMessage, runBotTurn } from "@/modules/conversations";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";
import { seedLiveBot } from "@/test/support/live-bot";
import { createTestNotifier } from "@/test/support/notifier";

let db: Database;
afterEach(async () => {
  if (db) await closeTestDatabase(db);
});

const setup = async () => {
  db = await createTestDatabase();
  const { route, clock } = await seedLiveBot(db);
  // Activation itself is covered by the Bot's tests; a turn only reads the flag.
  await db.update(channel).set({ botEnabled: true }).where(eq(channel.id, route.channelId));
  const conversationId = (await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: "5511999990001",
    profileName: "Ana",
    text: "Quanto custa?",
    sentAt: clock.now(),
  }))!;
  const notifier = createTestNotifier();
  return { route, clock, notifier, conversationId, dependencies: { db, clock, notifier } };
};

test("a turn sees its unanswered Contact messages and where to reply", async () => {
  const { dependencies, conversationId, route } = await setup();
  const seen = await runBotTurn(dependencies, conversationId, async (turn) => turn);
  if (typeof seen === "string") throw new Error(`Expected a turn, got ${seen}`);
  expect(seen.scope).toEqual(route);
  expect(seen.snapshot.current.map(({ text }) => text)).toEqual(["Quanto custa?"]);
  expect(seen.recipient).toMatchObject({ tenantId: route.tenantId, to: "5511999990001" });
});

test("only one turn runs per Conversation at a time", async () => {
  const { dependencies, conversationId } = await setup();
  const inner = await runBotTurn(dependencies, conversationId, async () =>
    runBotTurn(dependencies, conversationId, async () => "ran"),
  );
  expect(inner).toBe("busy");
});

test("the lease is released when the turn throws", async () => {
  const { dependencies, conversationId } = await setup();
  const failed = runBotTurn(dependencies, conversationId, async () => {
    throw new Error("Model crashed");
  });
  await expect(failed).rejects.toThrow("Model crashed");
  expect(await runBotTurn(dependencies, conversationId, async () => "ran")).toBe("ran");
});

test("after release, the follow-up says whether the backlog moved", async () => {
  const { dependencies, conversationId } = await setup();
  const followUps: boolean[] = [];
  const afterRelease = async (_: unknown, followUp: boolean) => {
    followUps.push(followUp);
    // The lease is already free here.
    expect(await runBotTurn(dependencies, conversationId, async () => "ran")).not.toBe("busy");
  };
  await runBotTurn(dependencies, conversationId, async () => "left", afterRelease);
  await runBotTurn(dependencies, conversationId, (turn) => turn.consume(), afterRelease);
  expect(followUps).toEqual([false, true]);
  expect(await runBotTurn(dependencies, conversationId, async () => "ran")).toBe("skipped");
});

test("a turn whose lease expired cannot reserve a Bot reply", async () => {
  const { dependencies, conversationId, clock } = await setup();
  const reserved = await runBotTurn(dependencies, conversationId, async (turn) => {
    clock.advance(121_000);
    return turn.reserve("O corte custa R$ 80.");
  });
  expect(reserved).toBeNull();
});

test("a Bot reply left pending without a wamid is never resent", async () => {
  const { dependencies, conversationId, notifier, route } = await setup();
  const reserved = await runBotTurn(dependencies, conversationId, (turn) =>
    turn.reserve("O corte custa R$ 80."),
  );
  expect(typeof reserved).toBe("string");
  await recordInboundTextMessage(db, route, {
    wamid: crypto.randomUUID(),
    from: "5511999990001",
    profileName: "Ana",
    text: "Oi?",
    sentAt: dependencies.clock.now(),
  });
  let responded = false;
  const outcome = await runBotTurn(dependencies, conversationId, async () => {
    responded = true;
  });
  expect(outcome).toBe("handoff");
  expect(responded).toBe(false);
  expect(notifier.pings.at(-1)).toEqual({ tenantId: route.tenantId, ping: { conversationId } });
});
