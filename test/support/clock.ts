import type { Clock } from "@/platform/clock";

export type TestClock = Clock & {
  set(date: Date): void;
  advance(milliseconds: number): void;
};

export const createTestClock = (
  start = new Date("2026-01-01T12:00:00.000Z"),
): TestClock => {
  let current = start.getTime();

  return {
    now: () => new Date(current),
    set: (date) => {
      current = date.getTime();
    },
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
};
