# Live Bot turns

Issue: [#56](https://github.com/danielluis07/clickstudio-bots/issues/56).

The owner opens **Painel → Bot**, saves the business profile, adds at least one
Knowledge base entry, and sends a successful **Testar Bot** message. **Ativar Bot**
is enabled only after these steps and a confirmed WhatsApp subscription. The
server enforces the same checklist. Provider failures do not complete testing;
settings and entry edits after testing require another test before activation.
Only the test timestamp is stored; sandbox content remains ephemeral.

Once activated, any Member can use **Pausar Bot** or **Retomar Bot** on the Bot
page. Pause is stored on the Channel, independently of activation and Schedule.
Pause and Schedule ineligibility leave Conversations with the Bot, without a
Handoff. Resuming still respects the configured Schedule.

## Delivery and recovery

Inbox processing enqueues `run-bot-turn` only for an unanswered, live Contact
message in an activated, subscribed, unpaused Channel and a Bot-owned Conversation.
Imported history, delivery statuses and app echoes do not start turns. Queue
failure leaves the inbox event unsettled so its idempotent processing can retry.

Unsupported media ([#61](https://github.com/danielluis07/clickstudio-bots/issues/61))
is filed with its kind and optional caption. The Conversation shows a pt-BR
placeholder directing the Member to WhatsApp. Voice notes of any duration and
other media without a caption hand off immediately as **O Bot não soube responder**, in the
same transaction as the inbound message, even when the Bot is paused or inactive.
They send no Bot reply and use no reply allowance. Required Contact capture does
not delay this Handoff. A duplicate inbound write cannot reverse a Member's return
to the Bot.

Other media with captions can start normal Bot turns. Only caption text reaches
the Model, marked as an unavailable attachment; the Bot answers if the caption
alone suffices and otherwise uses the existing Handoff flow. Channel eligibility,
Schedule and reply gates still apply. Media arriving during generation hands off
before the pending reply can pass its send checks. No attachment is downloaded or
stored, and no transcription or media-understanding adapter is configured.

QStash signs delivery to `/api/jobs/run-bot-turn`; the route verifies both the
body and destination and rejects extra fields. Jobs carry only a Conversation
id. The handler loads the Channel and resolves its `ChannelRoute` from the saved
phone-number-id. A Tenant id supplied by a caller never grants access.

Flow control uses `bot:<conversationId>` with parallelism one. Correctness comes
from an atomic conditional lease update, a unique lease token and a two-minute
expiry. A competing job gets HTTP 503 so QStash retries after a crashed holder.
A short repeatable-read transaction snapshots unanswered message ids and context;
Model and Meta calls run after it commits. Late messages get a follow-up job after
release. The snapshot's last Contact message is the unique answered-message key.
All unanswered texts are grouped into the current Contact turn, independently
of the core's bounded historical replay. A burst cannot silently mark questions
answered when they were omitted from the Model input.

### Bursts of messages

People often send several short messages in a row
([#144](https://github.com/danielluis07/clickstudio-bots/issues/144)). Each
`run-bot-turn` job from a Contact message, or from a follow-up, is delivered
3 s after it is enqueued (QStash `delay`). A job whose newest unanswered Contact
message is under 2 s old does nothing and returns 200: that message's own job
answers the whole burst in one turn. Each new message therefore extends the
wait. A Contact who keeps writing is answered once their oldest unanswered
message is 15 s old. A single message waits only the 3 s delay before its turn.
The quiet threshold stays below the delay, because Meta timestamps are truncated
to the second, so a job never waits on its own message. If the later job is
lost, the sweep recovers the burst after two minutes. Sweep jobs are not delayed.
The values are `burstWait` in `modules/bot/live.ts`.

## Reply gate

Whether the Bot may send its next reply is decided in one place,
`modules/bot/reply-gate.ts`. It reads the current saved state on every check
and writes nothing. A live turn asks it at three checkpoints:

- `enqueue`: eligibility only. An exhausted allowance still enqueues a turn, so
  that turn can hand off.
- `beforeModel`: everything, with whether a Model is configured.
- `beforeSend`: everything again after generation, with whether a sender is
  available. Any change made during the Model call is seen here.

Every checkpoint applies the same order, and the first match wins:

1. Not eligible (Channel not activated, paused or unsubscribed, or the
   Conversation is with the team): skip.
2. The 24-hour service window, opened by the Contact's latest live message, has
   closed: skip.
3. The monthly reply allowance is used up: Handoff as **Limite atingido**, even
   outside the Schedule.
4. Outside the Schedule: skip. The Schedule never causes a Handoff.
5. The Model or sender is unavailable: Handoff as **Bot indisponível**.

Skips leave the Conversation with the Bot. The worker writes a gate's Handoff
fenced by its lease and publishes an inbox notification.

## Reservation, send and recovery

Reservation atomically fences out expired holders and rechecks eligibility and
the service window. It uses the same SQL predicates as the gate
(`modules/conversations/bot-turns.ts`), so the two cannot disagree.
It inserts a pending Bot message and marks the snapshot's Contact messages
covered before calling Meta. A Model-requested Handoff is persisted in that same
reservation, so a crash after sending cannot lose the ownership change.
Success records the wamid and delivery status in one transaction,
reconciling an own echo that arrived first. Member Handoffs, resumption and the
waiting list are described in [Handoff ownership and controls](handoff.md). A retry finding pending without a
wamid marks it failed and hands off as **Bot indisponível**; it never resends.

The [sweep](inbox-operations.md#the-sweep), every five minutes, fails stuck
pending sends once their lease is absent or expired, hands off those
Conversations, clears stale leases, and re-enqueues eligible unanswered messages
from recovered leases. It preserves healthy leases and publishes inbox
notifications for committed Handoffs. It also re-enqueues a Contact message
whose job never ran, once it is two minutes old and for up to one hour, when the
reply gate would not skip it.

## Transient provider failures

Issue: [#138](https://github.com/danielluis07/clickstudio-bots/issues/138).

Adapters reject with `RetryableError` (`platform/retryable.ts`) only when a
call certainly had no effect and may succeed later. Anything else hands off as
before. There is still no fallback provider.

- **Model.** A timeout, a 408/409/429 or a 5xx (Anthropic or AI Gateway) is
  retryable. The adapter never retries within the turn. Instead the turn
  reserves nothing and releases its lease, and the job answers 503 without
  alerting, so QStash delivers it again (about 12 s, then 2.5 min later). The
  job reads its attempt from `Upstash-Retried`. On attempt `botTurnAttempts`
  (3), or when the count is missing, the turn hands off as **Bot
  indisponível**: a Contact waits about three minutes at most. Each attempt
  generates the reply again. A Model error that is not retryable, such as a
  400, hands off at once.
- **Meta.** A send Meta refused, which was not sent, is retried. That is a
  429, a 5xx carrying Meta's error code, or a throttling or "try again" code
  (`4`, `80007`, `130429`, `131056`, `1`, `2`, `131000`, `131016`). The worker
  resends the same pending reply within the turn after 1 s, then 3 s. If the
  last try is refused too, the reply fails and hands off. A timeout, a dropped
  connection, a 5xx without Meta's body or an unreadable success may have
  sent, so it is never resent: the reply fails and hands off, as before.

The pending row stays the only send barrier. A Meta retry reuses it, and a
Model retry happens before any reservation.

The gate asks `BotAllowance.canReply`; reservation calls `BotAllowance.reserve`
in the same transaction. The monthly accounting is described in
[Bot reply allowance](bot-reply-allowance.md). Sandbox counters remain separate
from production.

## Turn records

Issue: [#137](https://github.com/danielluis07/clickstudio-bots/issues/137).

Every live turn that completes writes one `bot_turn_record` row under its
Tenant: when it finished, how it ended (`sent`, `skipped` or `handoff`), the
Handoff reason, the Model's input, output, cache-read and cache-write tokens,
tool round trips and the turn's duration in milliseconds. A Model-requested
Handoff that also sends a reply is recorded as `handoff`. A skip before the
Model records zero tokens. The row holds counts and codes only, never message
text, names or phone numbers. A turn that throws is retried by its job and is
recorded when it completes. A Handoff the next job makes for a send left
pending by a crashed turn is not recorded.

The core returns its tokens on each outcome (`respond()`); `modules/bot/live.ts`
writes the row. A failed write logs `bot_turn_record_failed` and never fails
the turn. The sandbox and the provider evaluation write no rows, and the
sandbox never returns token counts to the browser.

Rows are kept 13 months by the daily `prune-bot-turn-records` task, deleted with
the Tenant, and left out of the Tenant export. Token use per Tenant per month,
in São Paulo time:

```sql
select tenant_id,
       date_trunc('month', at at time zone 'America/Sao_Paulo') as month,
       sum(input_tokens) as input_tokens,
       sum(output_tokens) as output_tokens,
       sum(cache_read_tokens) as cache_read_tokens,
       sum(cache_write_tokens) as cache_write_tokens
  from bot_turn_record
 group by 1, 2
 order by 1, 2;
```

Multiply each sum by the Model's price per token for the cost. The
[sweep](inbox-operations.md#the-sweep) uses these rows to alert on a jump in a
Tenant's **Bot indisponível** Handoffs.

## Verification

```powershell
bun test test/modules/bot/live.test.ts test/modules/bot/reply-gate.test.ts
bun test test/modules/bot/activation.test.ts test/server/bot-jobs.test.ts
$env:BOT_TEST_DATABASE_URL = 'postgresql://test_role@localhost:5432/test_database'
bun run test:postgres
```

The explicit Postgres command requires `BOT_TEST_DATABASE_URL`; it never falls
back to the app's `DATABASE_URL`. It creates an isolated schema and migration
journal through a direct node-postgres connection, then drops only that schema.
The real database tests compete twelve workers, recover an expired lease while
its old holder is still in the Model call, and retry while Meta is pending. The
Meta probe also checks that another connection can update the Conversation while
the external call waits. Routine tests use synthetic Model/Meta adapters.

CI adds **Real Postgres Bot turns** using a unique, schema-only ephemeral Neon
branch per run, a one-hour expiry and deletion in an `always()` step. Configure
the `NEON_API_KEY` repository secret and `NEON_PROJECT_ID` repository variable
for a dedicated Neon test project using the default `neondb` database and
`neondb_owner` role. Missing credentials fail this job explicitly; fork PRs skip
it because repository secrets are unavailable. The existing `check` job remains
the required branch-protection context.

Entry points: `modules/bot/index.ts`, `server/bot-jobs.ts`,
`server/services.ts`, `trpc/routers/bot.ts` and `components/bot/bot-activation.tsx`.
Conversation persistence is scoped by `ChannelRoute` in
`modules/conversations/bot-turns.ts`; Channel activation and pause writes live
in `modules/channels/bot-controls.ts`. Bot owns the activation checklist policy.
