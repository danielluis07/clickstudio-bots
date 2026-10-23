# Tenant cancellation and manual exports

Apply the database migrations with `bun run db:migrate` before using these
commands. Run them from a trusted administrator environment with the deployment's
database and WhatsApp encryption configuration. Each command checks that the
supplied administrator email belongs to an active platform administrator.
Tenant ids are the Better Auth organization ids. There is no self-service
cancellation or export UI.

## Record cancellation

```sh
bun run tenant:cancel admin@example.com <tenant-id>
```

The command records cancellation immediately, using the server clock. Membership
resolution, inbound Channel routing and every Bot reply checkpoint refuse a
canceled Tenant. An already-resolved webhook route also refuses Contact writes.
The same transaction marks the Channel disconnected; the command then asks Meta
to unsubscribe the app from that WABA. It preserves the WhatsApp Business app
and the Tenant's data, encrypted credential and original Bot enable/pause choices
for recovery. A send already accepted by Meta cannot be recalled.

If Meta is unavailable, the local stop remains in effect and the command exits
with code **2**. Repeat the command or let the daily task retry the disconnection.
Retries preserve the original cancellation timestamp and deletion deadline.
Other failures exit with code **1**; success exits with code **0**.

## Reactivate within 30 days

```sh
bun run tenant:reactivate admin@example.com <tenant-id>
```

Reactivation is permitted strictly before `canceledAt + 30 × 24 hours`. It
resubscribes the existing Channel before restoring access, leaving the Tenant
canceled if Meta refuses the stored credential. Correct the credential/configuration
and retry before the deadline. Tenants without a Channel can also be restored.
The original memberships, Knowledge base, settings and Bot pause/activation
choices remain intact. Reactivation does not undo Conversation Handoffs.

A short database lease serializes cancellation, disconnection retries and
reactivation without holding a transaction across Meta calls. An interrupted
command becomes retryable after two minutes.

## Daily hard deletion

The authenticated `GET /api/cron/daily` runs at 05:00 UTC. It retries failed or
interrupted disconnections, then deletes Tenants whose recovery deadline has
arrived. Each deletion rechecks cancellation under the same Tenant row lock used
by reactivation and skips a live administrator operation. Independent daily tasks
continue even if another task fails; a failed disconnection reports a failed task.

Deletion removes the Tenant, memberships, invitations, legal acceptances, Channel
and encrypted token, Contacts, Conversations, messages/changes, deletion markers,
Knowledge base, all Bot settings, activation and usage records. Matching raw inbox
events are removed by Channel phone-number-id or WABA id. Unroutable raw events
remain subject to the existing 30-day inbox retention. Exclusive Member identities,
accounts, sessions and password-reset verifications are removed. Shared identities
and platform administrator identities survive; shared sessions no longer reference
the deleted Tenant. Repeated cleanup is safe.

Billing is manual: invoice/payment records are held separately, outside these
Tenant-owned tables, and must be retained for the five-year period specified in
#37. This task does not delete them. Backups age out according to the disclosed
Neon restore window; this command changes the live database only.

## Manual JSON or CSV delivery

Generate the export promptly while the Tenant exists, including during the
30-day recovery period, and deliver it within **15 days of the request**. Confirm
the requesting owner's identity and the intended Tenant id before manual delivery.

```sh
bun run tenant:export admin@example.com <tenant-id> json ./tenant-exports/request-123-json
bun run tenant:export admin@example.com <tenant-id> csv ./tenant-exports/request-123-csv
```

The destination must be new. JSON writes `tenant.json`; CSV writes a manifest,
the Tenant and one file per product dataset (empty datasets produce empty files).
The snapshot uses one read-only, repeatable-read transaction and filters every
dataset to the requested Tenant. It includes Member names/emails and roles,
invitations, legal acceptances, Channel metadata, Contacts and captured details,
Conversations, messages and edits, Knowledge base, behaviour/capture/link settings,
activation and usage. It excludes passwords, sessions, reset tokens, encrypted
Meta credentials, lease tokens, replay barriers and raw webhook payloads.
Shared Members' other memberships are never exported.

CSV uses UTF-8, quoted fields, doubled quotes and CRLF row separators; nested
settings use JSON cells. Spreadsheet formula-like strings receive an apostrophe
prefix. JSON preserves the original text. Files use restrictive creation modes
where the operating system supports them, and existing output is never overwritten.
Treat the files as personal data, deliver through the approved private channel and
remove local copies after delivery. `tenant-exports/` is ignored by Git; no export
contents are printed to the terminal.

Meta's unsubscribe endpoint is documented in its
[official API collection](https://www.postman.com/meta/whatsapp-business-platform/request/3r2bl1m/unsubscribe-app-from-waba-s-webhooks).
