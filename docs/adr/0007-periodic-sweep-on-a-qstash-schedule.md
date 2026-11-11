# Recover stuck work with a sweep triggered by a QStash schedule

A sweep runs every five minutes and puts stuck work back on the queue (#134). A QStash schedule with the fixed id `sweep` calls `POST /api/jobs/sweep`. The route runs only for a QStash signature bound to that exact URL, verified the same way as the job routes. Each run does three things:

- It re-enqueues `pending` inbox events received at least five minutes earlier, or, for an event whose job already failed, at least 35 minutes after the last failure.
- It replays failed inbox events automatically, up to three times with backoff, before they alert and wait for an administrator (#135).
- It recovers Bot turns whose lease expired.
- It re-enqueues Bot-owned, eligible Conversations with no live lease whose newest unanswered Contact message is between two minutes and one hour old and passes the reply gate.

Automatic replay lives in the sweep rather than in a task of its own, for the same reason the sweep is the only recovery mechanism: one schedule, one authenticated endpoint, and the same failure boundaries. The Sentry alert moves from the first failure callback to the one after the last automatic replay.

Each scan handles at most 100 rows, and every step stays idempotent (ADR 0002). This is a third QStash-delivered endpoint beside ADR 0002's two job kinds, and it amends that ADR's recovery story. Before the sweep, a turn whose job ran out of retries waited for the Contact to write again, a crashed turn waited for the daily cron, and an event whose failure callback was lost stayed `pending` until it was pruned.

"QStash schedule" here means QStash's cron feature. It is unrelated to a Tenant's **Schedule** in the glossary.

## Considered Options

- **Vercel Cron:** rejected. How often it can run depends on the Vercel plan (once a day on Hobby), so recovery speed would change with billing. It would also need a second cron beside the daily one. The daily cron stays on Vercel, where once a day is enough.
- **Accept both a QStash signature and the `CRON_SECRET` bearer token:** rejected. A second authentication path for the same endpoint is more to test and keep safe, and nothing needs it.
- **A failure callback for `run-bot-turn`, like the inbox job's:** rejected as the only fix. It covers a job that ran out of retries, but not a worker that crashed holding the lease, nor a callback that never arrived. The sweep covers all three, so it is the only mechanism.
- **A self-rescheduling QStash message** (each run publishes the next with a delay): rejected. One failed publish ends the chain silently, while a QStash schedule keeps firing.
- **GitHub Actions or `pg_cron`:** rejected. Actions' schedule is best-effort and can be delayed by many minutes, and it adds a secret outside the deploy target. `pg_cron` would need the database to call the app over HTTP, or to duplicate domain logic in SQL.

## Consequences

- The QStash schedule lives in QStash, not in the repository. `bun run sweep:schedule` creates or updates it under its fixed id. Run it once for each environment, and again whenever `APP_URL` or `QSTASH_URL` changes. Until it runs, nothing recovers expired leases, because the daily cron no longer does.
- Since nothing in the repository notices a missing schedule, a watchdog does (#182): each run records when it finished, the daily Vercel cron alerts `sweep_stale` after 30 minutes without one, and `bun run doctor` checks that the schedule exists and calls this `APP_URL`.
- A failed run is not retried (`retries: 0`). The next run is five minutes away and repeats the same idempotent work.
- The sweep shares QStash's failure domain with the jobs it recovers. If QStash is down, neither runs. Meta's redelivery still stores events, and the sweep catches up once QStash returns.
- Lease recovery moved from the daily cron to the sweep, so a crashed turn is recovered in minutes, inside the 24-hour service window. Canceled Tenants' leases are left out of the scan, because no ChannelRoute can clear them.
- The one-hour limit is deliberate. A message skipped outside the Schedule is not answered hours later when the Schedule opens. It waits for the Contact to write again, as before the sweep.
- The Schedule and the reply allowance belong to the Tenant. When the gate skips one of a Tenant's Conversations, the sweep leaves that Tenant's other Conversations and scans up to three pages, so one quiet Tenant cannot fill every batch.
- Duplicate jobs are possible and harmless. A run can re-enqueue work whose job was only slow, and two runs before the jobs execute enqueue them twice. Each duplicate costs one idempotent delivery. Every job type sets its retry count explicitly instead of relying on the plan's default.
- Partial indexes keep the three cross-Tenant scans from reading whole tables: expired leases, Bot replies stuck without a wamid, and unanswered Contact messages.
