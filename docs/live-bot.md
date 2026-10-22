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

Immediately before reservation, the worker rechecks Schedule and the allowance
hook. Reservation atomically fences out expired holders and rechecks Conversation
ownership, Channel activation/pause/subscription and the 24-hour service window.
It inserts a pending Bot message and marks the snapshot's Contact messages
covered before calling Meta. A Model-requested Handoff is persisted in that same
reservation, so a crash after sending cannot lose the ownership change.
Success records the wamid and delivery status in one transaction,
reconciling an own echo that arrived first. A retry finding pending without a
wamid marks it failed and hands off as **Bot indisponível**; it never resends.

The daily cron's `recover-bot-turns` task fails stuck pending sends once their
lease is absent or expired, hands off those Conversations, clears stale leases,
and re-enqueues eligible unanswered messages from recovered leases. It preserves
healthy leases and publishes inbox notifications for committed Handoffs.

The live service exposes `BotAllowance.canReply` and `UsageMeter` for the billing
work. The current composition permits replies and does not implement monthly
accounting. Sandbox counters remain separate from production.

## Verification

```powershell
bun test test/modules/bot/live.test.ts
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
