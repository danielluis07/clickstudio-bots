import { describe, expect, test } from "bun:test";
import { statsPeriods, type ConversationStats } from "@/modules/conversations";
import {
  botOnlyShare,
  formatStatsDay,
  formatTimeAgo,
  openHourBands,
  parseStatsPeriod,
  placeholderConversationStats,
} from "@/modules/conversations/hooks";

describe("home page stats", () => {
  test("the period comes from the URL and falls back to 30 days", () => {
    expect(parseStatsPeriod("7")).toBe(7);
    expect(parseStatsPeriod("90")).toBe(90);
    expect(parseStatsPeriod("")).toBe(30);
    expect(parseStatsPeriod("365")).toBe(30);
  });

  test("the placeholder covers every São Paulo day of the period, ending today", () => {
    // 01:30 UTC is still the previous day in São Paulo.
    const now = new Date("2026-11-12T01:30:00Z");
    for (const period of statsPeriods) {
      const stats = placeholderConversationStats(period, now);
      expect(stats.period).toBe(period);
      expect(stats.daily).toHaveLength(period);
      expect(stats.daily.at(-1)?.date).toBe("2026-11-11");
      expect(stats.contactMessagesByHour.map(({ hour }) => hour)).toEqual(
        Array.from({ length: 24 }, (_, hour) => hour),
      );
      expect(stats.botOnlyConversations).toBeLessThanOrEqual(stats.activeConversations);
      expect(stats.latestHandoffs.every(({ at }) => at <= now)).toBe(true);
    }
    expect(placeholderConversationStats(7, now)).toEqual(placeholderConversationStats(7, now));
    expect(placeholderConversationStats(90, now).activeConversations).toBeGreaterThan(
      placeholderConversationStats(7, now).activeConversations,
    );
  });

  test("the Bot-only share is a whole percentage, and absent without conversations", () => {
    const stats = (active: number, botOnly: number) =>
      ({ activeConversations: active, botOnlyConversations: botOnly }) as ConversationStats;
    expect(botOnlyShare(stats(3, 2))).toBe(67);
    expect(botOnlyShare(stats(0, 0))).toBeNull();
  });

  test("Business hours shade each hour by how many weekdays it is open", () => {
    const closed = null;
    expect(
      openHourBands({
        monday: { opens: "09:00", closes: "18:00" },
        tuesday: { opens: "09:00", closes: "18:00" },
        wednesday: closed,
        thursday: closed,
        friday: closed,
        saturday: { opens: "08:30", closes: "12:00" },
        sunday: closed,
      }),
    ).toEqual([
      { from: 8, to: 8, days: 1 },
      { from: 9, to: 11, days: 3 },
      { from: 12, to: 17, days: 2 },
    ]);
  });

  test("days and times read in pt-BR", () => {
    expect(formatStatsDay("2026-11-01")).toBe("01/11");
    const now = new Date("2026-11-11T12:00:00Z");
    expect(formatTimeAgo(new Date("2026-11-11T11:48:00Z"), now)).toBe("há 12 minutos");
    expect(formatTimeAgo(new Date("2026-11-11T09:00:00Z"), now)).toBe("há 3 horas");
    expect(formatTimeAgo(new Date("2026-11-10T11:00:00Z"), now)).toBe("ontem");
  });
});
