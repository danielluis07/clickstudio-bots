import { describe, expect, test } from "bun:test";
import { formatListTime } from "@/platform/format";

// 14:30 on 24 Nov 2026 in São Paulo (UTC-3).
const now = new Date("2026-11-24T17:30:00Z");

describe("formatListTime", () => {
  test("shows the time today, 'Ontem' for yesterday and the date before that", () => {
    expect(formatListTime(new Date("2026-11-24T12:05:00Z"), now)).toBe("09:05");
    expect(formatListTime(new Date("2026-11-23T22:00:00Z"), now)).toBe("Ontem");
    expect(formatListTime(new Date("2026-11-22T12:00:00Z"), now)).toBe("22/11");
  });

  test("counts days in São Paulo, not UTC", () => {
    // 01:30 UTC on the 24th is still 22:30 on the 23rd in São Paulo.
    expect(formatListTime(new Date("2026-11-24T01:30:00Z"), now)).toBe("Ontem");
    // 03:10 UTC on the 24th is 00:10 in São Paulo, already today.
    expect(formatListTime(new Date("2026-11-24T03:10:00Z"), now)).toBe("00:10");
  });
});
