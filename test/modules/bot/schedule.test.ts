import { beforeEach, describe, expect, test } from "bun:test";
import type { ChannelRoute } from "@/modules/channels";
import { createBotCore, type BotTurn } from "@/modules/bot";
import {
  createTestBotRepository,
  createTestUsageMeter,
  type TestBotRepository,
} from "@/test/support/bot";
import { createTestClock } from "@/test/support/clock";
import { createTestModel } from "@/test/support/model";

const turn: BotTurn = {
  scope: { channelId: "channel-a", tenantId: "tenant-a" } as ChannelRoute,
  conversationId: "conversation-a",
};
const clock = createTestClock();
let repository: TestBotRepository;

const isScheduledAt = (instant: string) => {
  clock.set(new Date(instant));
  return createBotCore({
    model: createTestModel(),
    repository,
    meter: createTestUsageMeter(),
    clock,
  }).isScheduled(turn);
};

beforeEach(() => {
  repository = createTestBotRepository();
  // Open Tuesday to Saturday, 09:00 to 19:00 in São Paulo (UTC−3).
  repository.behaviour = { ...repository.behaviour, schedule: "outside_business_hours" };
});

describe("schedule eligibility", () => {
  test("an always-on Bot may reply at any time, open or closed", async () => {
    repository.behaviour = { ...repository.behaviour, schedule: "always" };

    expect(await isScheduledAt("2026-03-10T15:00:00.000Z")).toBe(true);
    expect(await isScheduledAt("2026-03-09T03:00:00.000Z")).toBe(true);
  });

  test("outside business hours only, the Bot is off from the opening minute until closing", async () => {
    // Tuesday 2026-03-10 in São Paulo.
    expect(await isScheduledAt("2026-03-10T11:59:00.000Z")).toBe(true);
    expect(await isScheduledAt("2026-03-10T12:00:00.000Z")).toBe(false);
    expect(await isScheduledAt("2026-03-10T21:59:00.000Z")).toBe(false);
    expect(await isScheduledAt("2026-03-10T22:00:00.000Z")).toBe(true);
  });

  test("a closed day is outside business hours all day", async () => {
    // Monday 2026-03-09, 12:00 in São Paulo.
    expect(await isScheduledAt("2026-03-09T15:00:00.000Z")).toBe(true);
  });

  test("hours and weekdays are those of São Paulo, not UTC", async () => {
    // Tuesday 18:00 in São Paulo, already 21:00 in UTC.
    expect(await isScheduledAt("2026-03-10T21:00:00.000Z")).toBe(false);
    // Saturday 21:30 in São Paulo is Sunday 00:30 in UTC, when the business is closed.
    repository.behaviour = {
      ...repository.behaviour,
      hours: { ...repository.behaviour.hours, saturday: { opens: "20:00", closes: "23:00" } },
    };
    expect(await isScheduledAt("2026-03-15T00:30:00.000Z")).toBe(false);
  });

  test("reads the settings saved now, so a schedule change applies to the next check", async () => {
    expect(await isScheduledAt("2026-03-10T15:00:00.000Z")).toBe(false);
    repository.behaviour = { ...repository.behaviour, schedule: "always" };
    expect(await isScheduledAt("2026-03-10T15:00:00.000Z")).toBe(true);
  });
});
