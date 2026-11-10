# Inbox recovery and daily maintenance

Issue: [#48](https://github.com/danielluis07/clickstudio-bots/issues/48).

The selected Sentry storage region is **US (Iowa)**. This replaces the original
EU requirement in #48 following the project owner's region decision.

## Deployment

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). The migration adds nullable failure
metadata and a received-at index; it preserves existing inbox events.

Configure these server-only variables in addition to the existing
[WhatsApp and QStash configuration](whatsapp-setup.md):

| Variable | Value |
| --- | --- |
| `SENTRY_DSN` | Project DSN from a Sentry organization created in the **US (Iowa)** region. The application accepts HTTPS `o….ingest.us.sentry.io` and `o….ingest.sentry.io` DSNs. |
| `CRON_SECRET` | Random secret of at least 16 characters. Vercel sends it as `Authorization: Bearer <secret>`. |

The repository configures the integration; creating the US Sentry organization,
setting its project DSN and an issue alert rule, and setting deployment secrets
are deployment steps. Without `SENTRY_DSN`, diagnostics go only to the scrubbed
structured logger. Without `CRON_SECRET`, the daily endpoint returns 503 and
does not delete anything. Use the DSN supplied by the US project.

Every boundary follows one rule (#136): catch, record a scrubbed diagnostic,
then answer what the caller expects. Two kinds of failure are told apart:

| Failure | Where it goes |
| --- | --- |
| Unexpected: the WhatsApp webhook cannot store a delivery, a Bot job or the inbox failure callback throws, a sweep or daily task fails, a tRPC procedure fails with an internal error, the dead letter | Structured log **and** Sentry |
| Condition: the inbox queue is not draining, or a Tenant's **Bot indisponível** Handoffs jump (see [the sweep](#the-sweep)) | Structured log **and** Sentry, grouped into one issue per kind and Tenant |
| Expected: a Meta call fails (4xx, 5xx, timeout), the Model fails and the turn hands off, an inbox job attempt fails (retries end in the dead letter), an invitation e-mail or realtime ping fails, the queue refuses an enqueue | Structured log only |

Successful message processing and dashboard requests make no Sentry network
calls. Its region affects alert delivery latency, not the successful messaging
path. US storage avoids a cross-Atlantic route from the planned US East
application deployment; no production latency benchmark is implied by this
choice. A Sentry delivery failure never changes a route's answer: the record is
already in the log, and a `diagnostic_delivery_failed` line follows it.

A record (`platform/diagnostics.ts`) may carry: the diagnostic kind, the error
class and the innermost known cause class, stack frames, Postgres SQLSTATE,
Meta's HTTP status, `code`, `error_subcode` and `fbtrace_id`, the Model
provider's status and request id, a code-defined operation name (tRPC path,
task, Meta call) and the Tenant, Conversation and inbox event ids. It never
carries error messages, request or response bodies, message text, names or
phone numbers. Each field is rebuilt from an allowlist and validated, never
copied. Stack frames are code locations only: they are read from what the
runtime writes after the message, so a message cannot inject a frame, and
paths are made relative to the project (or to `node_modules/`) so they do not
name the machine's user.

For Sentry SDK v11, PII collection is disabled through `dataCollection`: user
information, cookies, HTTP headers/bodies, URL query parameters, GraphQL/AI data,
database query data, queue arguments, stack variables and source context are all
disabled. An isolated client has no automatic integrations or tracing. Only
explicit reports are captured. `beforeSend` rebuilds each event from the
scrubbed diagnostic alone, removing request data, users, breadcrumbs, contexts,
error messages and attachments; its frames become the event's stack trace.
Structured logs use the same allowlist. SDK buffering is flushed before the
route returns (tRPC reports after its response, through `waitUntil`).

## Find and replay an event

Sign in as the platform administrator and open **Eventos com falha** at
`/admin/eventos`. The view shows event IDs, a bounded error class, status and
timestamps in Brasília time, 50 events per page. It never loads raw payloads,
phone numbers or Contact/message content into the view. It includes both
processing failures awaiting a retry and failures to enqueue a stored delivery.
Use **Atualizar** to load the current state.

Failed events are replayed automatically first (#135; see
[Automatic replay](#automatic-replay)). The **Situação** column shows when the
next automatic replay is due, or **Tentativas esgotadas** once none are left.

Correct the underlying cause, then choose **Reprocessar**. The action checks the
session, validates the event ID, and checks the administrator's current database
role again. It accepts no Tenant ID or event payload. Replay invokes the same
idempotent processor as a normal job and resolves its Tenant from the stored
event's Channel phone-number ID. A completed or ignored event stays completed;
replaying it again does not write messages or publish another ping. A pruned
event is unavailable. Unknown Channels and unsupported events remain ignored.

Normal processing errors keep the event pending for QStash retries and record
only an allowlisted class. When retries are exhausted, QStash calls
`POST /api/jobs/inbox-event-failed`. New inbox jobs register this failure callback
automatically. The callback verifies the QStash signature against its configured
URL, requires the original inbox job endpoint, and decodes only its ID-only
source body. Callback response bodies, headers and caller IPs are discarded.
An event whose endpoint was unreachable has class `JobDeliveryError`.

The callback marks an unsettled event failed. While it has automatic replays
left, that is all it does. After the last one, it also sends a scrubbed Sentry
error. Successful alert delivery is recorded separately so a failed/interrupted alert
can be retried by QStash. Buffer draining is not treated as delivery: only a
successful HTTP ingestion response acknowledges the alert. Duplicate callbacks after acknowledgment do nothing;
concurrent callbacks use a stable Sentry event ID. A callback arriving after
successful processing cannot reopen the event. A delivered job does not process
a failed event; only the sweep's automatic replay or an administrator does.

### Automatic replay

The sweep replays a failed event up to three times, 10 minutes, 1 hour and 4
hours after the failure before each one. A replay puts the event back to
`pending` and enqueues a normal job, so each one gets QStash's three retries
and the failure callback again. With QStash's own backoff of about 33 minutes
per job, an event that keeps failing alerts roughly seven and a half hours
after it arrived. That outlasts an outage of several hours and leaves time to
answer inside WhatsApp's 24-hour service window. A replayed message that is
still recent can start a Bot turn, exactly as on its first delivery.

If enqueuing a replay fails, the event stays `pending` and the stalled-event
scan enqueues it 35 minutes later. Events alerted before this feature existed
are not replayed automatically.

### Bulk replay

**Reprocessar esta página** replays the events listed on the current page;
**Reprocessar todos** replays every listed failure. Both check the session and
the administrator's current database role, and accept only event IDs (at most
one page of 50) or no IDs at all, never a Tenant ID or payload. Each event goes
back to `pending` with a fresh set of three automatic replays and a fresh
alert, and is enqueued as a normal job, 100 per QStash batch. Refresh the page
to see which ones are left.

Jobs already published before this deployment do not acquire a callback
retroactively. Previously recorded processing errors are not backfilled.
Inspect QStash's existing dead-letter queue during rollout; an administrator can
recover a known retained pending event through the same replay action.

## Delete a Contact

A Tenant owner can choose **Excluir contato** in the Contact panel (#66).
The confirmation warns that the Contact, its Conversations and captured data
are permanently removed, and reminds the owner to delete the
Conversation in the WhatsApp Business app too. The mutation checks the current
Tenant membership and owner role on the server. Other Members have no delete
control and cannot invoke the operation directly.

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). Deletion atomically
removes the Contact, all its Conversations/messages, and message edits/revokes,
including changes whose original message has not arrived. Captured fields are
columns of the Contact row, so they are erased with it. Voice transcription is
[deferred](voice-notes.md) (#62). If introduced in the future, transcripts must
participate in the same Contact/Conversation erasure.

The migration backfills existing edit/revoke address hashes from their original
messages or retained signed inbox events, checking Tenant and event identity.
It refuses to complete if a legacy change has neither source: resolve its
address attribution through the privacy handling process before rerunning.
Do not bypass the required hash constraint, which prevents unattributed text
from escaping later Contact erasure.

A replay barrier stores only the Tenant ID, a SHA-256 hash of the Tenant ID and
Contact phone, and the deletion time. This is pseudonymous erasure metadata,
not an anonymization guarantee. It is retained until the Tenant is deleted and
contains no names, raw phones or message content. Contact writes and deletion
share a short transaction lock per address; external calls never hold this lock.

The internal admission module in `modules/conversations/contact-deletion.ts`
owns this lock, deletion chronology, history filtering and Contact/Conversation
filing in one transaction. Event writers receive only admitted events. Echo
reconciliation keeps its message lock first and runs admission in a savepoint;
both locks remain held until the outer transaction commits.

Pending/failed inbox events received on or before deletion settle without
restoring Contact data. Messages/echoes, imported history, edits/revokes and app
contact names dated on or before deletion are also suppressed when delivered
later. Mixed history chunks retain only messages after deletion. A genuinely
new message creates a fresh Contact and Conversation; the barrier remains so
later imports cannot restore the deleted content into that new Conversation.
WhatsApp timestamps have only second precision. A message sent in the same
second as deletion is ambiguous, even if received later, and is suppressed to
avoid restoring old content. A fresh message timestamped in a subsequent second
can create the new Contact.
Terminal processed/ignored events remain no-ops.

### Raw inbox events of a deleted Contact

Issue: [#150](https://github.com/danielluis07/clickstudio-bots/issues/150).

Deletion also erases, in the same transaction, the raw inbox events about the
Contact's address on the Tenant's Channel. Each split event is about at most
one address, which the generated `contact_phone` column reads from its
payload: a message's, edit's or reaction's sender, a status's or echo's
recipient, a history thread's wa_id or an app contact's number, with any `+`
removed. Events about no Contact, such as `account_update`, have none.

Every matching row, in any status, keeps its id, dedupe key and timestamps,
but its payload becomes `{"erased": true}` and its `contact_phone` becomes
null. Keeping the dedupe key means a Meta redelivery of the same event stays a
no-op instead of storing the content again. Pending and failed rows settle as
`ignored` with reason `contact_deleted` and leave **Eventos com falha**, so a
queued job, the sweep, an automatic or bulk replay and **Reprocessar** all
find a settled event and do nothing. Even an unsettled tombstone would be
ignored as unsupported. A job that read the payload before the deletion
committed is still refused by the replay barrier above.

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). The migration adds the generated
column and its index; Postgres computes the column for existing rows, so
events stored before the deployment are erased too.

What this does not cover:

- An event delivered after the deletion that carries older content, such as a
  late history chunk, is not filed (see above) but keeps its payload under
  the 30-day retention below.
- A signed delivery the platform could not split is stored whole as
  `unrecognized`, with no address, and also follows the 30-day retention.
- A hash dedupe key is a SHA-256 of the event's content. It holds no readable
  text or phone, but someone who already knows the exact content can match it.
- Backups keep the deleted rows for the recovery window disclosed on the
  Privacy page; a restore must reapply pending deletions.

## Daily tasks

Vercel invokes `GET /api/cron/daily` daily at **05:00 UTC** (`0 5 * * *`) after
production deployment. The endpoint rejects missing/incorrect credentials with
401, compares the bearer token in constant time, and disables caching. It deletes
raw inbox rows strictly older than 30 days by `receivedAt`, in every status.
Rows exactly 30 days old remain until the next run. It also deletes
[Bot turn records](live-bot.md#turn-records) older than 13 months. Duplicate
calls are safe.

The same endpoint retries canceled Channels' disconnections and hard-deletes
Tenants at their 30-day recovery deadline. See the
[Tenant lifecycle runbook](tenant-lifecycle.md) for cancellation, reactivation,
manual JSON/CSV exports and billing-record retention.

The task list is composed in `server/services.ts`. Later tickets can append
their own daily tasks without adding schedules or auth entry points. Each task
has a fixed name and its own failure boundary; independent later tasks still run
after a failure. The response contains names and success flags only, returning
500 if any task failed. Vercel does not automatically retry failed cron calls;
check production cron logs and rerun the authenticated endpoint after fixing a
failure. Scheduled invocations run only in production.

## The sweep

Issue: [#134](https://github.com/danielluis07/clickstudio-bots/issues/134).
Decision: [ADR 0007](adr/0007-periodic-sweep-on-a-qstash-schedule.md).

A QStash schedule calls `POST /api/jobs/sweep` every five minutes. The route
verifies the QStash signature against its own URL and returns 401 otherwise, or
503 without the QStash signing keys. Each run:

1. Re-enqueues up to 100 inbox events still `pending` five minutes after they
   were received, oldest first. An event whose job already failed waits until
   35 minutes after its last failure or replay, so QStash's own retries come
   first.
2. Replays up to 100 failed events whose next
   [automatic replay](#automatic-replay) is due.
3. Fails Bot replies stuck without a wamid behind an expired lease, hands those
   Conversations off and clears the expired leases. Then it re-enqueues eligible
   unanswered messages from the recovered Conversations.
4. Re-enqueues up to 100 Bot-owned, eligible Conversations with no live lease
   whose newest unanswered Contact message was sent between two minutes and one
   hour ago and passes the [reply gate](live-bot.md#reply-gate). A message
   skipped outside the Schedule is never answered later by the sweep. The
   Schedule and allowance are per Tenant, so a skip leaves that Tenant's other
   Conversations out of the run, which scans up to three pages. Canceled
   Tenants are left out of lease recovery.
5. Returns to the Bot up to 100 Handoffs, oldest first, with no message from
   either side for 24 hours, a whole service window. They stay on the waiting
   list, and their backlog is settled as after **Devolver ao Bot**. See
   [Resuming](handoff.md#resuming).
6. Alerts `inbox_queue_stale` with its age in seconds while the oldest
   `pending` inbox event that never failed was received more than 15 minutes
   ago, past two requeues. Failed events alert on their own, after their last
   automatic replay.
7. Alerts `bot_handoff_spike` with counts for each Tenant whose
   [turn records](live-bot.md#turn-records) in the last hour show at least
   three **Bot indisponível** Handoffs, at least 20% of its turns that were not
   skipped, and at least twice its rate over the six days before. A Tenant with
   no earlier turns is judged on the first two conditions.
8. Makes `restricted` Channels whose restriction has ended healthy, then
   alerts `channel_unhealthy` once for each Channel that reached a new
   [health](whatsapp-setup.md#channel-health), with the Tenant and the state
   as `operation`. For `credential_rejected` and `removed`, ask the owner to
   reconnect; for `banned` and `restricted`, the owner appeals to Meta.

The first two alerts repeat on every sweep while the condition holds; Sentry
groups them into one issue per kind (and Tenant), so its issue alert fires once.

Each task has its own failure boundary, as in the daily endpoint. A failed task
logs `sweep_task_failed` with its error class only. Running the sweep again
right away does no harm: it may enqueue the same jobs twice, but they are
idempotent and their second delivery changes nothing.

QStash retries each job with an explicit count: three for
`process-inbox-event` and `run-bot-turn`. The sweep itself is not retried; the
next run comes five minutes later.

Create or update the QStash schedule after the first deploy of an environment,
and again whenever `APP_URL` or `QSTASH_URL` changes. Run it with that
environment's public `APP_URL` and its QStash credentials, not the local
`.env`: QStash cannot call `localhost`, and the script refuses a local
`APP_URL`. Variables set in the shell take precedence over `.env`:

```powershell
$env:APP_URL = 'https://<production domain>'
$env:QSTASH_TOKEN = '<production QStash token>'
bun run sweep:schedule
Remove-Item Env:APP_URL, Env:QSTASH_TOKEN
```

Set `QSTASH_URL` the same way if that environment uses another QStash region.
Run `bun run db:migrate` first: the migration adds the partial indexes the
sweep's scans use.

## References

- [QStash callbacks and failure callbacks](https://upstash.com/docs/qstash/features/callbacks)
- [QStash schedules](https://upstash.com/docs/qstash/features/schedules)
- [Sentry data storage locations](https://docs.sentry.io/organization/data-storage-location/)
- [Sentry Node configuration](https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/)
- [Vercel cron authentication and management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
