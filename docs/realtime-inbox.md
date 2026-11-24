# Realtime inbox

Set `ABLY_API_KEY` in the server environment (`.env` locally, Vercel environment variables when deployed). Create an Ably Pub/Sub app and a key with `publish` and `subscribe` capabilities restricted to `tenant:*:inbox` and `tenant:*:member:*:alerts`. Keep the key server-only; it has no `NEXT_PUBLIC_` counterpart. Ably documents resource patterns and token restrictions in [Capabilities](https://ably.com/docs/auth/capabilities).

Without this variable, messaging, Alerts and authenticated queries continue to work, but live updates are disabled. The token procedure refuses with `PRECONDITION_FAILED`, and the browser logs `Inbox realtime unavailable` once per inbox mount and `Alerts realtime unavailable` once per dashboard load. No Ably credentials are needed for the routine test suite.

## Data and authorization

`Notifier` is the shared port in `platform/notifier.ts`. The Ably adapter publishes an `invalidate` event on `tenant:<tenantId>:inbox`. Its payload is exactly one of:

```json
{ "conversationId": "<id>" }
```

```json
{ "contactId": "<id>" }
```

The adapter explicitly projects these identifiers. Message text, names, phone numbers and credentials never belong in a ping.

Alerts ([ADR 0010](adr/0010-alerts-stored-per-member-and-written-with-their-event.md)) travel on each Member's own channel, `tenant:<tenantId>:member:<memberId>:alerts`. The adapter publishes an `alert` event whose payload is exactly:

```json
{ "alertId": "<id>" }
```

The browser calls the authenticated `realtime.token` tRPC mutation. `tenantProcedure` resolves current membership before the server signs an Ably TokenRequest, with a five-minute TTL and `subscribe` access to exactly that Tenant's inbox channel and the Member's own Alerts channel, never another Member's. It returns both channel names. The procedure accepts no Tenant, Member, channel or capability input. The Member id is the token's client identity. The [Ably TokenRequest flow](https://ably.com/docs/auth/token) exchanges that signed request for a token without exposing the API key.

The SDK renews through the same mutation, rechecking membership. If the session's Tenant or Member changes, the browser closes the old connection. Removal does not revoke an already issued Ably token immediately: it expires within five minutes. Every application data read rechecks membership regardless of token lifetime.

## Delivery and refetch

Inbound messages, app replies, delivery statuses, edits and revocations notify after their database writes commit. A failed publish leaves the webhook inbox job pending; QStash retries the idempotent write and notification before settling the job. Duplicate pings are safe.

Dashboard replies notify after the pending reply commits and again after the send outcome is stored. Contact renames notify after the authorized update. These interactive operations keep their successful write/send result if notification delivery fails and log only `Inbox notification failed`.

The inbox loads the browser SDK on mount, retrying transient startup failures every five seconds. Disabled realtime and authorization refusals stop startup retries. Pings invalidate the Conversation list and the affected Conversation details and messages; Contact renames invalidate the list and Contact details displayed in Conversations. Attachment and recovery invalidate all inbox queries to catch up on changes missed while offline or before subscribing. Refetches use authenticated, Tenant-scoped tRPC procedures, following ADR 0006. Unmounting cancels retries, removes listeners and closes the connection.

Future Conversation state changes should publish a `conversationId` ping through the same port after committing their writes.

## Alerts

Alerts are written in the same transaction as the Handoff or Contact message that raises them (`raiseHandoffAlerts` and `raiseMessageAlerts`, `modules/conversations/alerts.ts`), so a failed write fails the job and QStash retries it. The Alerts a transaction raised are announced after it commits, one `alert` ping per Member, best effort like inbox pings: the webhook inbox job announces those of an inbound message, a Bot turn those of its Handoffs. Each Member gets only the kinds their Alert preferences enable when the event is raised (`alert_preference`; Handoff and Team message on, Any message off, until the Member changes them in the Notificações section of Configurações). A Handoff the Bot causes raises a Handoff Alert. A new Contact message raises a Team message Alert when the team owns the Conversation and the Member has that kind on, otherwise an Any message Alert if the Member has that on, so a Member gets at most one Alert per message. Changing preferences never adds or removes past Alerts. Assumir, Member replies and returns to the Bot raise none. Unread Alerts of one kind for one Conversation merge into one with a count, which moves to the top; each keeps its latest event's key, so a retried job or Bot turn adds nothing.

The subscription lives in the `/painel` header's bell (`AlertBell`), so it runs on every dashboard page. It opens its own connection with the same token procedure, subscribes to `alertsChannel`, and refetches `alerts.list` on each ping and on every (re)attachment. Opening a Conversation in Conversas, by any route, marks its Alerts read through `alerts.markConversationRead`; while it stays open in a visible tab, Alerts raised for it are marked read as they arrive. "Limpar tudo" deletes the Member's own Alerts.

Every dashboard tab puts the unread count in front of its title, e.g. `(3) Painel`, and keeps it there across navigations (`useAlertTabTitle`). There are no toasts. A ping with an Alert id can also play a sound and show a browser notification, each only if the Member's Alert preferences turn it on (`createAlertSignaller`, `modules/conversations/hooks/alert-signals.ts`). The notification carries the Contact's name and the kind, never message text, and shows only when no dashboard tab is in front. Clicking it opens the Conversation. The browser is asked for notification permission only when the Member turns the switch on; if it refuses, the switch stays off. With several tabs open, each offers the Alert event (its id and merge count) and the first to claim it, under a browser-wide Web Lock with the claims recorded in `localStorage`, is the only one that signals. A tab showing the Alert's Conversation in front claims first and stays silent, so an Alert that arrives read signals nowhere. A tab in front claims before background tabs. Without Web Locks, each tab decides on its own.

The daily cron's `prune-alerts` deletes Alerts whose latest event is more than 30 days old. Deleting a Contact deletes their Alerts with the Conversation, and removing a Member deletes that Member's. Alerts are not part of the Tenant data export.

## Manual check with Ably configured

1. Open `/painel/conversas` in two Member sessions belonging to one Tenant and select a Conversation.
2. Send an inbound WhatsApp message. Both inboxes and the open Conversation should refresh without a reload.
3. Reply from one dashboard and from the WhatsApp Business app; check that the other dashboard updates, including delivery status, edits and revocations.
4. Disconnect and reconnect the browser's network, then check that messages received while offline appear after reattachment.
5. Inspect Ably events: payloads must contain only a Conversation or Contact id. A different Tenant's dashboard must receive none of those events.
6. With both sessions on another dashboard page, take over a Conversation in one and send an inbound message to it: both bells count one Alert without a reload. Open the Conversation from one bell: only that Member's Alert turns read. Alert payloads must contain only an Alert id, on the receiving Member's own channel.

Automated tests exercise token isolation, public messaging operations and Alert raising with a fake Notifier, and browser cache invalidation/subscription cleanup. They do not contact a live Ably app.
