---
status: accepted
---

# Store Alerts per Member and write them with the event that raises them

Members get Alerts in a dashboard bell they can read and clear: a Handoff the Bot caused, a Contact message in a Conversation the team owns, and, if they choose, any Contact message. Each Alert is stored once per Member. Only Members whose Alert preferences enable that kind at the time get a row, and it is written in the same transaction as the message or Handoff, with a key per event so a retried webhook inbox job or Bot turn cannot duplicate it. A per-Member Ably channel (`tenant:<t>:member:<m>:alerts`) carries an id-only ping after commit.

## Considered Options

- **Derive the bell from the "Aguardando equipe" waiting list:** rejected. It cannot offer read and clear per Member, since "clearing" would mean resolving Conversations for the whole team. It also cannot cover "any Contact message".
- **Keep Alerts in browser memory:** rejected. The bell would empty on reload and differ between devices.
- **One row per Tenant, with read state per Member filtered at read time:** rejected. Alert preferences apply only from when they change, so a read-time filter would have to replay preference history. A Member removed and re-invited would also see old Alerts.
- **Write Alerts after commit, best-effort:** rejected. A crash between commit and the Alert write would silently drop the Alert. In the same transaction, a failed Alert write fails the job, and QStash retries the whole idempotent write (ADR 0002).
- **Refetch the bell on every ping on the Tenant inbox channel:** rejected. Every Member would refetch on every message, even when nothing was raised for them.

## Consequences

- Inbound message processing and Bot turns write one row per eligible Member, so their cost grows with team size. Teams are small, and only enabled kinds write rows.
- Changing Alert preferences never fills or empties the bell for the past.
- Alerts older than 30 days are deleted by the daily cron. Contact deletion and Member removal delete their Alerts. Alerts are not part of the Tenant data export.
- The Ably key's capability must cover `tenant:*:member:*:alerts` as well as `tenant:*:inbox`.
