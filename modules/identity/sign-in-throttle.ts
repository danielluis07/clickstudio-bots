import { inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { signInAttempt } from "@/db/schema";
import type { Clock } from "@/platform/clock";

// Password checks allowed per client IP and per target email (#77). Every
// attempt counts, right or wrong, so parallel guesses cannot slip past a
// check made before their failures are recorded.
export const signInAttemptLimits = {
  perIp: { limit: 10, windowMs: 60_000 },
  perEmail: { limit: 10, windowMs: 15 * 60_000 },
} as const;

const longestWindowMs = Math.max(
  ...Object.values(signInAttemptLimits).map(({ windowMs }) => windowMs),
);

type SignInAttemptSubject = {
  // Null when the request carries no trustworthy client IP.
  ip?: string | null;
  email?: string | null;
};

const normalizeSignInEmail = (email: string) => email.trim().toLowerCase();

export const createSignInThrottle = ({ db, clock }: { db: Database; clock: Clock }) => {
  // One statement per key, outside any transaction: the upsert locks only its
  // own counter row, so concurrent attempts are counted one after another.
  const count = async (key: string, { limit, windowMs }: { limit: number; windowMs: number }) => {
    const now = clock.now();
    const expired = sql`${signInAttempt.windowStartedAt} <= ${new Date(now.getTime() - windowMs).toISOString()}::timestamptz`;
    const [row] = await db
      .insert(signInAttempt)
      .values({ key, windowStartedAt: now, attempts: 1 })
      .onConflictDoUpdate({
        target: signInAttempt.key,
        set: {
          attempts: sql`case when ${expired} then 1 else ${signInAttempt.attempts} + 1 end`,
          windowStartedAt: sql`case when ${expired} then ${now.toISOString()}::timestamptz else ${signInAttempt.windowStartedAt} end`,
        },
      })
      .returning({ attempts: signInAttempt.attempts });
    return row!.attempts <= limit;
  };

  return {
    // Records one attempt for the subject; false when it is over a limit, and
    // the caller must then refuse without checking the password.
    async attempt({ ip, email }: SignInAttemptSubject) {
      const allowed: boolean[] = [];
      if (ip) allowed.push(await count(`ip:${ip}`, signInAttemptLimits.perIp));
      const normalized = email ? normalizeSignInEmail(email) : "";
      if (normalized) {
        allowed.push(await count(`email:${normalized}`, signInAttemptLimits.perEmail));
      }
      return allowed.every(Boolean);
    },
  };
};

export type SignInThrottle = ReturnType<typeof createSignInThrottle>;

const pruneBatchSize = 1_000;

// Daily: deletes counters whose window ended, in batches so no statement
// outlasts the role's statement timeout after a flood of distinct keys.
export const pruneSignInAttempts = async (db: Database, clock: Clock) => {
  const cutoff = new Date(clock.now().getTime() - longestWindowMs);
  let total = 0;
  for (;;) {
    const batch = db
      .select({ key: signInAttempt.key })
      .from(signInAttempt)
      .where(lt(signInAttempt.windowStartedAt, cutoff))
      .limit(pruneBatchSize);
    const deleted = await db
      .delete(signInAttempt)
      .where(inArray(signInAttempt.key, batch))
      .returning({ key: signInAttempt.key });
    total += deleted.length;
    if (deleted.length < pruneBatchSize) return total;
  }
};
