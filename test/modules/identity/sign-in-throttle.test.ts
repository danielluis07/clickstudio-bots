import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@/db/database";
import {
  createSignInThrottle,
  pruneSignInAttempts,
  signInAttemptLimits,
  type SignInThrottle,
} from "@/modules/identity";
import { closeTestDatabase, createTestDatabase, queryTestDatabase } from "@/test/support/database";
import { createTestClock, type TestClock } from "@/test/support/clock";

let db: Database;
let clock: TestClock;

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createTestClock();
});

afterEach(() => closeTestDatabase(db));

const attemptTimes = async (
  throttle: SignInThrottle,
  times: number,
  subject: Parameters<SignInThrottle["attempt"]>[0],
) => {
  const results: boolean[] = [];
  for (let i = 0; i < times; i++) results.push(await throttle.attempt(subject));
  return results;
};

describe("sign-in throttle", () => {
  test("allows 10 attempts per IP in a minute and refuses the 11th", async () => {
    const throttle = createSignInThrottle({ db, clock });

    const results = await attemptTimes(throttle, 11, { ip: "203.0.113.7" });

    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results.at(-1)).toBe(false);
  });

  test("an IP's attempts are allowed again once its minute has passed", async () => {
    const throttle = createSignInThrottle({ db, clock });
    await attemptTimes(throttle, 11, { ip: "203.0.113.7" });

    clock.advance(60_000);

    expect(await throttle.attempt({ ip: "203.0.113.7" })).toBe(true);
  });

  test("allows 10 attempts per email in 15 minutes, from any IP, in any letter case", async () => {
    const throttle = createSignInThrottle({ db, clock });
    for (let i = 0; i < 10; i++) {
      expect(await throttle.attempt({ ip: `198.51.100.${i}`, email: "dona@sorriso.example" })).toBe(
        true,
      );
      clock.advance(60_000);
    }

    expect(await throttle.attempt({ ip: "192.0.2.1", email: " Dona@Sorriso.example " })).toBe(
      false,
    );
    clock.advance(5 * 60_000);
    expect(await throttle.attempt({ ip: "192.0.2.1", email: "dona@sorriso.example" })).toBe(true);
  });

  test("other IPs and emails are unaffected by one that is over its limit", async () => {
    const throttle = createSignInThrottle({ db, clock });
    await attemptTimes(throttle, 11, { ip: "203.0.113.7", email: "dona@sorriso.example" });

    expect(await throttle.attempt({ ip: "203.0.113.8", email: "outra@sorriso.example" })).toBe(
      true,
    );
  });

  test("counters are shared by every throttle on the same database", async () => {
    const first = createSignInThrottle({ db, clock });
    const second = createSignInThrottle({ db, clock });

    await attemptTimes(first, 5, { ip: "203.0.113.7" });
    await attemptTimes(second, 5, { ip: "203.0.113.7" });

    expect(await first.attempt({ ip: "203.0.113.7" })).toBe(false);
  });

  test("concurrent attempts never let more than the limit through", async () => {
    const throttle = createSignInThrottle({ db, clock });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => throttle.attempt({ ip: "203.0.113.7" })),
    );

    expect(results.filter(Boolean)).toHaveLength(signInAttemptLimits.perIp.limit);
  });

  test("pruning removes counters whose window has long passed and keeps current ones", async () => {
    const throttle = createSignInThrottle({ db, clock });
    await throttle.attempt({ ip: "203.0.113.7", email: "antiga@sorriso.example" });
    clock.advance(24 * 60 * 60_000);
    await throttle.attempt({ ip: "203.0.113.8" });

    await pruneSignInAttempts(db, clock);

    const rows = await queryTestDatabase<{ key: string }>(db, "select key from sign_in_attempt");
    expect(rows.map(({ key }) => key)).toEqual(["ip:203.0.113.8"]);
  });
});
