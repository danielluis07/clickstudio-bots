import type { Database } from "@/db/database";
import type { BotJob, BotJobQueue } from "@/modules/bot/live-jobs";
import type { ReplyGate } from "@/modules/bot/reply-gate";
import type { ChannelRoute } from "@/modules/channels";
import { listStrandedBotConversations, recoverStaleBotTurns } from "@/modules/conversations";
import type { Clock } from "@/platform/clock";
import type { Notifier } from "@/platform/notifier";

// The sweep recovers a Contact message whose Bot job never ran once it is two
// minutes old, past any live turn's lease. After an hour it leaves it: a
// message that old was skipped on purpose, outside the Schedule, and waits for
// the Contact to write again.
const strandedAfterMs = 2 * 60_000;
const strandedUntilMs = 60 * 60_000;
const strandedPerSweep = 100;
// Pages a sweep may scan when the reply gate skips whole Tenants.
const strandedPages = 3;

// Every few minutes: recovers crashed turns, then re-enqueues Contact
// messages whose job never ran. Idempotent; each scan is bounded.
export const createBotSweep =
  ({
    db,
    clock,
    notifier,
    queue,
    gate,
    enqueue,
  }: {
    db: Database;
    clock: Clock;
    notifier: Notifier;
    queue: BotJobQueue;
    gate: ReplyGate;
    enqueue: (scope: ChannelRoute, conversationId: string) => Promise<void>;
  }) =>
  async () => {
    const recovered = new Set<string>();
    await recoverStaleBotTurns({ db, clock, notifier }, async (scope, conversationId) => {
      recovered.add(conversationId);
      await enqueue(scope, conversationId);
    });
    const now = clock.now();
    const skippedTenants = new Set<string>();
    const seen = new Set(recovered);
    const jobs: BotJob[] = [];
    for (let page = 0; page < strandedPages && jobs.length < strandedPerSweep; page++) {
      const stranded = await listStrandedBotConversations(db, now, {
        sentAfter: new Date(now.getTime() - strandedUntilMs),
        sentBy: new Date(now.getTime() - strandedAfterMs),
        limit: strandedPerSweep - jobs.length,
        except: { tenantIds: [...skippedTenants], conversationIds: [...seen] },
      });
      if (!stranded.length) break;
      for (const candidate of stranded) {
        seen.add(candidate.conversationId);
        if (skippedTenants.has(candidate.scope.tenantId)) continue;
        // The gate as the turn would see it, so a Schedule skip is not
        // retried every sweep. Eligibility and the service window are in
        // the scan; the Schedule and allowance are per Tenant, so one skip
        // leaves the Tenant's other Conversations for the next page.
        // An exhausted allowance still runs, to hand off.
        if ((await gate.check(candidate, "beforeModel")).kind === "skip")
          skippedTenants.add(candidate.scope.tenantId);
        else jobs.push({ type: "run-bot-turn", conversationId: candidate.conversationId });
      }
    }
    if (jobs.length) await queue.enqueue(jobs);
  };
