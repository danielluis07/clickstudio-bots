# Run everything serverless on Vercel, with QStash jobs and a Postgres lease per Conversation

The whole MVP (dashboard, Meta webhook, Bot loop) is one Next.js app on Vercel with no long-running worker. The webhook only verifies the signature, stores the raw event in a deduplicated inbox table, enqueues a job and returns 200. Upstash QStash delivers two kinds of job back to app routes: "process inbox event" and "run Bot turn". Only one Bot turn runs per Conversation at a time. Correctness comes from a lease column on the Conversation, claimed by one atomic `UPDATE … WHERE lease is null or expired RETURNING`. QStash flow control, keyed by Conversation id, only reduces contention. For one developer this means one deploy target, one runtime and one set of logs. A Bot turn (one LLM call plus one send, p95 ≤ 8 s) fits comfortably inside function limits.

## Considered Options

- **Always-on worker (Fly, Railway) consuming webhooks and running the Bot loop:** rejected. It means two deploy targets and two runtimes to keep in step, and none of the work needs a process that outlives a request.
- **Vercel Queues:** rejected for now. It was in public beta as of 2026-10-19, with no per-key concurrency and no dead-letter queue, and local development needs the cloud service.
- **Row locks or advisory locks held for the whole turn:** rejected. A turn waits on an 8 s LLM call, so no transaction or lock may span an external call. The lease is a plain column that expires on its own.

## Consequences

- Delivery is at-least-once everywhere (Meta retries for up to 7 days, QStash retries jobs), so every handler is idempotent. Inbox rows dedupe by wamid or event hash. A Bot reply is stored as `pending` before sending, and a retry that finds `pending` without a wamid hands off instead of sending again.
- Transactions are short and never wrap an LLM, transcription or Meta call.
- Updated on 2026-11-09 (ADR 0007): a QStash schedule also calls a sweep every five minutes. It re-enqueues stuck inbox events and Bot turns, and it took over lease recovery from the daily cron.
- Updated on 2026-11-10 (#144): a Contact message's Bot job is delivered with a 3 s QStash delay, so a burst of messages gets one turn. A Contact therefore waits for the delay plus the turn (p95 ≤ 8 s), and up to 15 s plus the turn while they keep writing. The wait is a QStash `delay` rather than a sleep inside the job, so no function is held open while it waits.
- Revisit only if Bot turns stop fitting function limits, or if QStash's cost or reliability becomes a problem. The core reaches the queue only through a `JobQueue` port.
