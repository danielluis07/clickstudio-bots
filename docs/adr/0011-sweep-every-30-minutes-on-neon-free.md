---
status: accepted
---

# Run the sweep every 30 minutes while production is on Neon's Free plan

The sweep (ADR 0007) ran every five minutes. Neon suspends a compute after five minutes without queries, so each run arrived just before the compute could suspend, and production's compute ran around the clock even with no traffic. At its minimum size (0.25 CU) that is about 6 CU-hours a day. In November 2026 the Neon console showed 94.5% of the Free plan's monthly compute allowance used and the compute running for days without a break. Query performance showed the sweep's `sweep_run` write as the most frequent query. A compute that uses up its allowance is suspended until the next cycle, which stops webhooks, Bot replies and the dashboard. We now run the sweep every 30 minutes (`sweepIntervalMinutes` in `platform/qstash.ts`), so the compute sleeps for most of each interval when nobody writes. That costs about 1 CU-hour a day with no traffic.

This interval exists because of the Free plan's allowance, not because 30 minutes is the right recovery time. **Revisit it when production moves to a paid Neon plan** (see the last section).

## Considered Options

- **Upgrade Neon now:** rejected for now. Production had no clients yet, so paying for an always-on compute bought nothing. It is the intended end state.
- **Every 15 minutes:** rejected. With the compute awake about five minutes after each run, that is about a third of the day, roughly 65 CU-hours a month before any traffic. That leaves too little of the allowance for real conversations.
- **Every 60 minutes or longer:** rejected. Stranded Contact messages are recovered only between two and 60 minutes old (`modules/bot/live.ts`). With an interval of 60 minutes or more, a message could fall between two runs and never be answered.
- **Trigger the sweep only when work is in flight** (enqueue a delayed sweep with each job): rejected. ADR 0007 rejected self-rescheduling chains because one failed publish ends them silently. It would also need a new way to notice a missing sweep.
- **Move the sweep to `pg_cron` or Vercel Cron:** rejected for the reasons in ADR 0007, and `pg_cron` would keep the compute awake just the same.

## Consequences

- Recovery is slower. A lost inbox job or Bot job waits for the next run, up to 30 minutes instead of five. QStash's own retries still handle most failures within minutes; the sweep only covers what they miss.
- The thresholds that assumed a five-minute cadence follow the interval. `inbox_queue_stale` fires after five minutes plus two intervals (65 minutes). `sweep_stale` fires after three intervals (90 minutes). Automatic replays of failed events (10 minutes, 1 hour, 4 hours) happen at the first run after they are due.
- The two-to-60-minute window for stranded Contact messages is longer than one interval, so every such message is seen by at least one run. Keep the interval under 58 minutes, and a divisor of 60, since the cron is `*/N`.
- More cold starts. The first request after a quiet period waits for the compute to wake, usually well under a second. The pool's 5-second connection timeout covers it (README, "Scale to zero").
- The QStash schedule lives in QStash, so changing the constant does nothing until `bun run sweep:schedule` runs for each environment.

## When production moves to a paid Neon plan

On a paid plan, compute is billed by usage instead of being capped, so faster recovery is worth paying for. When that happens:

1. Set `sweepIntervalMinutes` back to `5`. The thresholds derived from it return to roughly their original values on their own (`inbox_queue_stale` 15 minutes, `sweep_stale` 15 minutes).
2. Update the docs that state the interval: `README.md` ("Scale to zero"), `docs/inbox-operations.md` ("The sweep" and "The watchdog"), `docs/live-bot.md`, `docs/whatsapp-setup.md` and ADR 0007.
3. Mark this ADR `superseded` and point it at the ADR or change that restores the interval.
4. Run `bun run sweep:schedule` and then `bun run doctor` with each environment's `APP_URL` and `QSTASH_TOKEN`.

A five-minute sweep keeps the compute running around the clock at its minimum size, so expect that baseline in the bill. If that cost matters, an interval between 5 and 30 minutes is a reasonable middle ground. Check the plan's scale-to-zero options too, since paid plans may allow a longer suspend timeout.
