# Inbox recovery and daily maintenance

Issue: [#48](https://github.com/danielluis07/clickstudio-bots/issues/48).

The selected Sentry storage region is **US (Iowa)**. This replaces the original
EU requirement in #48 following the project owner's region decision.

## Deployment

Run `bun run db:migrate` before deploying. The migration adds nullable failure
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

Sentry receives alerts only from the background dead-letter callback. Successful
message processing and dashboard requests make no Sentry network calls. Its
region affects alert delivery latency, not the successful messaging path. US
storage avoids a cross-Atlantic route from the planned US East application
deployment; no production latency benchmark is implied by this choice.

For Sentry SDK v11, PII collection is disabled through `dataCollection`: user
information, cookies, HTTP headers/bodies, URL query parameters, GraphQL/AI data,
database query data, queue arguments, stack variables and source context are all
disabled. An isolated client has no automatic integrations or tracing. Only
explicit dead-letter alerts are captured. `beforeSend` rebuilds each event from
known diagnostic kinds, known error classes and validated identifiers, removing
request data, users, breadcrumbs, contexts, extras, error messages/stacks/causes
and attachments. Structured logs use the same allowlist. SDK buffering is flushed
before the callback returns.

## Find and replay an event

Sign in as the platform administrator and open **Eventos com falha** at
`/admin/eventos`. The view shows event IDs, a bounded error class, status and
timestamps in Brasília time, 50 events per page. It never loads raw payloads,
phone numbers or Contact/message content into the view. It includes both
processing failures awaiting a retry and failures to enqueue a stored delivery.
Use **Atualizar** to load the current state.

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

The callback marks an unsettled event failed and sends a scrubbed Sentry error.
Successful alert delivery is recorded separately so a failed/interrupted alert
can be retried by QStash. Buffer draining is not treated as delivery: only a
successful HTTP ingestion response acknowledges the alert. Duplicate callbacks after acknowledgment do nothing;
concurrent callbacks use a stable Sentry event ID. A callback arriving after
successful processing cannot reopen the event. Automatic jobs do not process
dead-lettered events; an administrator can replay them.

Jobs already published before this deployment do not acquire a callback
retroactively. Previously recorded processing errors are not backfilled.
Inspect QStash's existing dead-letter queue during rollout; an administrator can
recover a known retained pending event through the same replay action.

## Delete a Contact

A Tenant owner can choose **Excluir contato** in the Contact panel (#66).
The confirmation warns that the Contact and its Conversations, transcripts and
captured data are permanently removed, and reminds the owner to delete the
Conversation in the WhatsApp Business app too. The mutation checks the current
Tenant membership and owner role on the server. Other Members have no delete
control and cannot invoke the operation directly.

Run `bun run db:migrate` before deploying this feature. Deletion atomically
removes the Contact, all its Conversations/messages, and message edits/revokes,
including changes whose original message has not arrived. Transcripts and
captured fields do not have persisted tables yet; when introduced, they must
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
Terminal processed/ignored events remain no-ops. Raw inbox events keep their
existing retention policy below; deletion does not extend it.

## Daily tasks

Vercel invokes `GET /api/cron/daily` daily at **05:00 UTC** (`0 5 * * *`) after
production deployment. The endpoint rejects missing/incorrect credentials with
401, compares the bearer token in constant time, and disables caching. It deletes
raw inbox rows strictly older than 30 days by `receivedAt`, in every status.
Rows exactly 30 days old remain until the next run. Duplicate calls are safe.

The task list is composed in `server/services.ts`. Later tickets can append
their own daily tasks without adding schedules or auth entry points. Each task
has a fixed name and its own failure boundary; independent later tasks still run
after a failure. The response contains names and success flags only, returning
500 if any task failed. Vercel does not automatically retry failed cron calls;
check production cron logs and rerun the authenticated endpoint after fixing a
failure. Scheduled invocations run only in production.

## References

- [QStash callbacks and failure callbacks](https://upstash.com/docs/qstash/features/callbacks)
- [Sentry data storage locations](https://docs.sentry.io/organization/data-storage-location/)
- [Sentry Node configuration](https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/)
- [Vercel cron authentication and management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
