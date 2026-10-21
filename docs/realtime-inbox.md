# Realtime inbox

Set `ABLY_API_KEY` in the server environment (`.env` locally, Vercel environment variables when deployed). Create an Ably Pub/Sub app and a key with `publish` and `subscribe` capabilities restricted to `tenant:*:inbox`. Keep the key server-only; it has no `NEXT_PUBLIC_` counterpart. Ably documents resource patterns and token restrictions in [Capabilities](https://ably.com/docs/auth/capabilities).

Without this variable, messaging and authenticated inbox queries continue to work, but live updates are disabled. The token procedure refuses with `PRECONDITION_FAILED`, and the browser logs `Inbox realtime unavailable` once per inbox mount. No Ably credentials are needed for the routine test suite.

## Data and authorization

`Notifier` is the shared port in `platform/notifier.ts`. The Ably adapter publishes an `invalidate` event on `tenant:<tenantId>:inbox`. Its payload is exactly one of:

```json
{ "conversationId": "<id>" }
```

```json
{ "contactId": "<id>" }
```

The adapter explicitly projects these identifiers. Message text, names, phone numbers and credentials never belong in a ping.

The browser calls the authenticated `realtime.token` tRPC mutation. `tenantProcedure` resolves current membership before the server signs an Ably TokenRequest, with a five-minute TTL and `subscribe` access to exactly that Tenant's inbox channel. The procedure accepts no Tenant, channel or capability input. The Member id is the token's client identity. The [Ably TokenRequest flow](https://ably.com/docs/auth/token) exchanges that signed request for a token without exposing the API key.

The SDK renews through the same mutation, rechecking membership. If the session's Tenant changes, the browser closes the old connection. Removal does not revoke an already issued Ably token immediately: it expires within five minutes. Every application data read rechecks membership regardless of token lifetime.

## Delivery and refetch

Inbound messages, app replies, delivery statuses, edits and revocations notify after their database writes commit. A failed publish leaves the webhook inbox job pending; QStash retries the idempotent write and notification before settling the job. Duplicate pings are safe.

Dashboard replies notify after the pending reply commits and again after the send outcome is stored. Contact renames notify after the authorized update. These interactive operations keep their successful write/send result if notification delivery fails and log only `Inbox notification failed`.

The inbox loads the browser SDK on mount, retrying transient startup failures every five seconds. Disabled realtime and authorization refusals stop startup retries. Pings invalidate the Conversation list and the affected Conversation details and messages; Contact renames invalidate the list and Contact details displayed in Conversations. Attachment and recovery invalidate all inbox queries to catch up on changes missed while offline or before subscribing. Refetches use authenticated, Tenant-scoped tRPC procedures, following ADR 0006. Unmounting cancels retries, removes listeners and closes the connection.

Future Conversation state changes should publish a `conversationId` ping through the same port after committing their writes.

## Manual check with Ably configured

1. Open `/painel/conversas` in two Member sessions belonging to one Tenant and select a Conversation.
2. Send an inbound WhatsApp message. Both inboxes and the open Conversation should refresh without a reload.
3. Reply from one dashboard and from the WhatsApp Business app; check that the other dashboard updates, including delivery status, edits and revocations.
4. Disconnect and reconnect the browser's network, then check that messages received while offline appear after reattachment.
5. Inspect Ably events: payloads must contain only a Conversation or Contact id. A different Tenant's dashboard must receive none of those events.

Automated tests exercise token isolation, public messaging operations with a fake Notifier, and browser cache invalidation/subscription cleanup. They do not contact a live Ably app.
