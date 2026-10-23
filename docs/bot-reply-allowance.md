# Monthly Bot reply allowance

Issue: [#60](https://github.com/danielluis07/clickstudio-bots/issues/60).

The Tenant owner sees `Respostas do Bot neste mês: N / 5.000` on **Painel**,
without charts. The authenticated `bot.usage` query takes no Tenant id and
refuses other Members. The display refreshes every minute and on focus/reconnect.

The allowance is 5,000 Bot replies per Tenant per calendar month in
`America/Sao_Paulo`. A reply counts when Meta returns its `wamid`, using the
injected Clock at acknowledgment, even when generation began in the previous
month. Member replies, templates, imported history, pending/uncertain sends,
duplicate jobs and sandbox output do not consume it. A later delivery failure
does not undo an acknowledged send.

Acknowledgment and the monthly increment commit in the same short transaction.
The message's first `wamid` is the deduplication barrier. Monthly aggregates
survive Contact deletion and are removed with the Tenant. No external call holds
a database lock. The migration backfills existing eligible replies using their
stored send time, since they predate acknowledgment-time counting.

Conversations owns the first-acknowledgment decision and the query for active
pending Bot replies, whose lifetime follows its Bot lease. The live turn calls
`recordSentWamid` and, only for a newly acknowledged production Bot reply,
`recordBotReplyUsage` inside one transaction. The allowance owns the monthly
aggregate, uses the Bot Schedule's `botTimeZone`, and asks tenancy for the warning
recipient. Its live-turn port requires permission, reservation and warning
methods; tests that isolate permission use the complete allowance fake in
`test/support/bot.ts`. These ownership decisions implement
[#115](https://github.com/danielluis07/clickstudio-bots/issues/115).

Live turns check the allowance before generation and again before reserving a
send. Their short reservation transactions lock the Tenant's monthly aggregate
and include active pending Bot sends in the limit check, bounding overshoot to
two replies. Contention retries the job without sending or counting. Once
exhausted, the next eligible Contact message causes
a Handoff with `limite_atingido`, displayed as **Limite de respostas atingido**
in the inbox. No overage charge is created. Month rollover opens a fresh counter;
it never changes existing Conversation ownership or clears a Handoff.

At 4,000 replies the dashboard shows an Alert and the owner receives a pt-BR
email through the existing Resend Mailer. An atomic claim with a one-minute lease
coordinates concurrent senders. The saved recipient and fixed payload use a
stable Resend idempotency key per Tenant/period. A sent timestamp suppresses
later warnings throughout that period. Failed or interrupted warning delivery
is recovered by QStash's Bot job retries, even with no unanswered messages or an
existing Handoff. The daily cron is a fallback, independently of sending to Meta. Resend retains
idempotency keys for 24 hours; recovery after an ambiguous acceptance must happen
within that window to retain its external deduplication guarantee.

Run `bun run db:migrate` before deploying. The production wiring lives in
`server/services.ts`. Public behavior tests are in
`test/modules/bot/allowance.test.ts`, `test/modules/bot/live.test.ts`,
`test/trpc/router.test.ts`, and `test/components/bot-usage.test.tsx`.
