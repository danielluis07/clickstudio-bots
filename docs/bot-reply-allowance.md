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
a Handoff with `allowance_exhausted`, displayed as **Limite de respostas atingido**
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

## Daily cap per Contact

Issue: [#143](https://github.com/danielluis07/clickstudio-bots/issues/143).

Without it, one Contact writing in a loop could spend the whole Tenant's
allowance in a few hours and leave every other Contact with a
`allowance_exhausted` Handoff. So each Contact gets at most 30 Bot replies per day
in `America/Sao_Paulo` (`dailyContactReplyLimit` in
`modules/bot/contact-cap.ts`). The cap is the same for every Tenant.

- The count covers the Bot replies sent to the Contact since São Paulo
  midnight, across the Contact's Conversations. Pending sends count, because
  they may still reach the Contact. Failed sends, imported history and sandbox
  output do not count.
- The reply gate checks the cap after the Tenant's allowance and before the
  Schedule, at `beforeModel` and `beforeSend`. A capped Contact's next message
  hands off as `contact_cap_reached`, shown as **Limite diário do contato
  atingido**, without calling the Model and without sending. As with the
  allowance, this happens even outside the Schedule. Other Contacts of the
  Tenant are still answered.
- The send reservation counts again inside its transaction, after the lease
  check has locked the Conversation's row. A reservation that would pass the
  cap fails with `ReservationRaceError` and the job retries, without an
  alert. The retry's gate then hands off.
- **Devolver ao Bot** and **Resolvida** record `returned_by_member_at` on the
  Conversation. Replies sent before that time stop counting, so a Member who
  returns a capped Conversation gives the Contact a fresh 30. Automatic
  returns do not reset the count.
- Midnight starts a fresh count but does not return the Conversation. It stays
  with the team until a Member returns it, or until the quiet-window sweep
  returns it after 24 hours with no messages.

Tests: `test/modules/bot/reply-gate.test.ts` (cap, São Paulo boundary, other
Contacts, Member return), `test/modules/bot/live.test.ts` (end to end) and
`test/modules/bot/live.postgres.test.ts` (a reply committed after the gate,
concurrent turns).

## Deployment

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). The production wiring lives in
`server/services.ts`. Public behavior tests are in
`test/modules/bot/allowance.test.ts`, `test/modules/bot/live.test.ts`,
`test/trpc/router.test.ts`, and `test/components/bot-usage.test.tsx`.
