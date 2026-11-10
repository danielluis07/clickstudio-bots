# WhatsApp Channel setup

Issue: [#42](https://github.com/danielluis07/clickstudio-bots/issues/42).
Architecture: [ADR 0001](adr/0001-direct-meta-tech-provider.md).

## Environment and database

Configure these server-only variables on the deployment that hosts `/painel`:

| Variable | Value |
| --- | --- |
| `META_APP_ID` | Meta Tech Provider app ID |
| `META_APP_SECRET` | The app secret |
| `META_WHATSAPP_SIGNUP_CONFIG_ID` | Facebook Login for Business **v4** configuration ID |
| `META_GRAPH_API_VERSION` | Graph API version; defaults to `v26.0` |
| `WHATSAPP_TOKEN_KEY_VERSION` | Active encryption key version, for example `2026-10` |
| `WHATSAPP_TOKEN_KEYS` | JSON object mapping versions to base64-encoded, random 32-byte keys |
| `META_WEBHOOK_VERIFY_TOKEN` | Random string (16+ characters) entered as the webhook's **Verify token** in Meta |
| `QSTASH_TOKEN` | QStash token of the **US East** region |
| `QSTASH_URL` | QStash API URL; defaults to the US East region, `https://qstash-us-east-1.upstash.io` |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | The US East region's signing keys, used to authenticate jobs |

The verification handshake needs only `META_WEBHOOK_VERIFY_TOKEN`. The webhook
stores deliveries only when `META_APP_SECRET` and `QSTASH_TOKEN` are set. Without
them it answers 503 and Meta keeps retrying. The job endpoint also needs both
signing keys. QStash tokens and keys are per region; use the US East region's.
A token from another region fails every enqueue: the webhook answers 500 and
Meta keeps retrying, so events wait in the inbox but are never processed.

Generate each encryption key with:

```powershell
bun -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'
```

Set `WHATSAPP_TOKEN_KEYS` to `{"2026-10":"<generated base64 key>"}` and
`WHATSAPP_TOKEN_KEY_VERSION` to `2026-10`. Keep the keys in the deployment's secret
store. To rotate, add a new key and change the active version; retain every old
version while stored Channels still use it. Removing an old key prevents those
Channels from authenticating. Restore that key before retrying their subscription.

Run `bun run db:migrate` against the direct database endpoint before deploying the
new code. The migration adds a Channel table with unique Tenant, WABA and
phone-number IDs. It does not modify existing Tenant data. A Tenant's Channel is
deleted when its Tenant is deleted.

Without the Meta configuration or encryption variables, the dashboard remains
available and explains that Channel connection is unavailable. No Meta or
database deployment changes are performed by the application at build time.

## Meta app configuration

1. Use our direct Tech Provider app with Cloud API access. Complete the required
   App Review/Advanced Access before onboarding paying Tenants.
2. In **Facebook Login for Business → Configurations**, create a configuration
   with the **Embedded Signup** variation and select the **Cloud API** product.
   Product selection makes this a v4 configuration; the JavaScript session
   payload can still report version 3. Use a Business Integration System User
   business token. Request `whatsapp_business_management` and
   `whatsapp_business_messaging`; avoid unrelated permissions.
3. Under Facebook Login for Business settings, enable the JavaScript SDK and
   applicable OAuth login options. Add the actual HTTPS hosting domain to
   **Allowed Domains** and the launch page to the permitted OAuth redirect URIs.
4. Set the app's WhatsApp webhook callback URL to
   `https://<host>/api/webhooks/whatsapp` and its verify token to
   `META_WEBHOOK_VERIFY_TOKEN`; Meta checks both with a handshake when saved.
   Then subscribe its `whatsapp_business_account` object to **all** of:
   `messages`, `account_update`, `smb_message_echoes`, `history`,
   `smb_app_state_sync`. Message delivery statuses use `messages`.
   History and contacts arrive through `history` and `smb_app_state_sync`
   ([history import](#history-import-and-contacts-sync)).
5. Set the configuration ID in the environment. The launch supplies
   `featureType: "whatsapp_business_app_onboarding"`, session logging, and
   `response_type: "code"`. It does not select a legacy signup version or declare
   product permissions in the JavaScript call.

The server exchanges the code and discovers the phone on the authorized WABA,
requiring `is_on_biz_app: true` and `platform_type: "CLOUD_API"`. If Meta omits
`phone_number_id`, exactly one eligible number must be discoverable. The server
rejects an ambiguous WABA rather than selecting an arbitrary number. Coexistence
numbers are already registered; this flow does not register them again.

The server checks the app's active webhook fields through `/{app-id}/subscriptions`
and calls `POST /{waba-id}/subscribed_apps` with the business token. WABA
subscriptions inherit the app's fields. The Channel records the required fields,
attempt time and success/failure; only confirmed success marks it subscribed.
Missing fields, rejected requests and timeouts leave the encrypted credential
stored and the Bot off. The owner can retry from the dashboard after correcting
the app setup, without repeating signup. A persisted `pending` attempt is also
retryable if execution stopped after storing the Channel.

Plaintext tokens exist only inside the WhatsApp adapter. The database receives an
AES-256-GCM envelope with a random 96-bit IV and key version. Authenticated data
binds it to Tenant, WABA, phone and version. Channel summaries, action responses
and routing lookups omit credentials. Tokens are sent to Meta in Authorization
headers, never URL query parameters, jobs, models or logs. Code exchange uses a
POST body so the app secret and authorization code do not enter request URLs.
Vendor errors are replaced with fixed error codes/messages.

## Webhook inbox

Issue: [#43](https://github.com/danielluis07/clickstudio-bots/issues/43).
Architecture: [ADR 0002](adr/0002-serverless-only-with-qstash-and-postgres-lease.md).

`POST /api/webhooks/whatsapp` checks `X-Hub-Signature-256` against the app secret
and rejects a bad signature with 401, storing nothing. It splits a valid delivery
into one `inbox_event` row per message, status or other change. Each row is keyed by
`<field>:<wamid>` when that wamid identifies the event, otherwise by a hash of the
event. A status, edit or revoke only refers to a message, so it is hashed. Several
statuses about one message therefore stay separate events. Redelivering an event,
in any batch, never stores it twice.

After storing, the webhook enqueues one QStash job per still-pending event,
carrying only `{ inboxEventId }`, and returns 200. If enqueueing fails it returns
500. The stored events stay pending, and Meta's redelivery enqueues them again.
Meta retries for up to seven days. An event left pending without a live job is
re-enqueued by the [sweep](inbox-operations.md#the-sweep) after five minutes.
Redelivery can enqueue a duplicate
job for an event that is already queued; processing treats it as a no-op.

QStash calls `POST /api/jobs/process-inbox-event`. The route rejects requests
without a valid `Upstash-Signature` for that exact URL and body (401) and payloads
other than an id (400). Processing resolves the Tenant only from the Channel
whose phone-number-id the event names. A text message becomes the Contact (unique
per Tenant and phone), their Conversation on that Channel, and the message
(unique per wamid). Events for an unknown phone-number-id are marked `ignored`
(`unknown_channel`) and create nothing. So are events not handled yet
(`unsupported_event`: media, non-text echoes, caption edits, group messages;
see #61). Processing is idempotent, so QStash retries and duplicate jobs are
safe. A job that keeps failing goes to QStash's dead-letter queue; inspecting
and replaying those uses the [internal recovery view](inbox-operations.md).

### Coexistence echoes, edits and revokes

Issue: [#46](https://github.com/danielluis07/clickstudio-bots/issues/46).

A `smb_message_echoes` text whose wamid matches a message the platform sent is
an own echo. It creates nothing and is not Conversation activity. Any other
echo is a Member's reply from the WhatsApp Business app (`origin: "app"`),
shown as "Equipe (app WhatsApp)", since the echo does not say which Member
sent it. `recordMessageEcho` returns this classification (`app_reply` or
`own_echo`) for Handoff. Ownership is never inferred from read receipts, text
or timing. If an echo is processed before Meta's answer to our send is stored,
it is first filed as an app reply. Storing the wamid then replaces that row
with the dashboard reply under a per-wamid lock, keeping its delivery status. Handoff (#57) must treat that
window as a known limitation.

Edits and revokes, by the Contact (`messages`) or from the app
(`smb_message_echoes`), carry their own wamid and name `original_message_id`. Each
is stored in `message_change` and applied when messages are read. So it takes
effect whichever of the change and its original arrives first. The latest
edit's text wins. A revoke is final and hides the text ("Mensagem apagada").
A change applies only to a message in the same Tenant, in its author's
direction. Changes never move a Conversation's latest activity.

### History import and contacts sync

Issue: [#49](https://github.com/danielluis07/clickstudio-bots/issues/49).

Run `bun run db:migrate` before deploying. The migration adds the Channel's
`contacts_sync` and `history_sync` states (default `pending`), the Contact's
`app_name` and `app_name_changed_at`, and the message's `imported` flag
(default `false`). Existing rows keep their data.

Meta accepts `POST /{phone-number-id}/smb_app_data` once per onboarding, within
24 hours, for each of `smb_app_state_sync` (contacts) and `history`. As soon as
the subscription is confirmed, by signup or by an owner's retry, the platform
requests contacts and then history. Each request is claimed in the database
first, so concurrent retries ask once. A request Meta refuses is not repeated:
a second attempt needs offboarding and a new Embedded Signup. Meta's response
only confirms acceptance; its `request_id` is not stored.

The dashboard shows "Histórico não importado" on the Channel card and above the
inbox when the history request was refused, the business declined to share
history (any `history` error, including `2593109`), or 24 hours passed without
a confirmed subscription. Channels connected before this deployment were never
asked and show it too.

Each history chunk is split into one inbox event per Contact thread, keyed by a
hash of the thread and its chunk metadata, so redelivered chunks are stored
once. Chunks of every phase may arrive in any order. Text messages are filed in
the Contact's Conversation with `imported = true`: the Contact's own as
inbound, the business's as app replies with the shared delivery status (a
`PENDING` one shows none). Media placeholders and other types are skipped. A
wamid already received live keeps its live record. Imported messages enqueue no
job, so they never start a Bot turn, a Handoff or a counted Bot reply; they only
ping the open inbox. They may later serve as context within the replay window.

Each `smb_app_state_sync` contact sets the `app_name` of the Contact with that
phone, and a removal clears it. Only people who have written to the business
are Contacts, so the rest of the app's contacts are not stored and no Contact
is created or duplicated. Meta sends the initial contacts before history, so a
person first seen in imported history gets an app name only from a later app
edit. Only a change newer than the applied one counts, so out-of-order events
end at the latest. The inbox shows the name a Member gave
in the dashboard first, then the app name, then the WhatsApp profile name; sync
never overwrites the dashboard name.

Groups are outside the product. Meta leaves them out of history; messages that
name a `group_id`, live or in history, and history threads not keyed by a
Contact's wa_id are ignored.

### Channel health

Issue: [#145](https://github.com/danielluis07/clickstudio-bots/issues/145).

Run `bun run db:migrate` before deploying. The migration adds the Channel's
`health` (default `healthy`), `health_changed_at`, `health_alerted_at` and
`restricted_until`.

A Channel's `health` says whether Meta still lets it send. Anything but
`healthy` makes the Channel ineligible for the Bot, so no Bot turn is enqueued,
run or recovered by the sweep. Its Conversations stay with the Bot, which
resumes once the Channel is healthy again; Members cannot send through it
either, so a Handoff would not help.

| Health | Set when | Cleared when |
| --- | --- | --- |
| `credential_rejected` | Meta refuses a Bot or Member send for the credential: codes 0, 10, 102, 190, 200–299 and 131005 | The owner reconnects |
| `removed` | `account_update`: `PARTNER_REMOVED`, `PARTNER_APP_UNINSTALLED`, `ACCOUNT_DELETED` or `ACCOUNT_OFFBOARDED` | The owner reconnects |
| `banned` | `account_update`: `DISABLED_UPDATE` with `waba_ban_state` `DISABLE` | `DISABLED_UPDATE` with `REINSTATE` |
| `restricted` | `account_update`: `ACCOUNT_RESTRICTION` with `RESTRICTED_CUSTOMER_INITIATED_MESSAGING` | Its `expiration` passes; never without one |

A transient refusal (429, Meta's throttling codes, a 5xx) or a send that may
have reached Meta never changes the health. The send that meets a rejected
credential still fails its reply and hands off as **Bot indisponível**, once.
A lesser state never replaces a more lasting one: removal over a ban, a ban
over a rejected credential or a restriction.

`account_update` events name the WABA, not a phone number id, so they are
routed by the entry id (`resolveChannelWaba`). Other documented events
(`VERIFIED_ACCOUNT`, `PARTNER_ADDED`, `PARTNER_APP_INSTALLED`,
`ACCOUNT_VIOLATION`, `ACCOUNT_RECONNECTED`, a scheduled ban, restrictions on
business-initiated messaging or adding numbers, pricing and certification
updates) are settled as `ignored` with `known_event`. An event the platform
does not know stays `unsupported_event` for inspection.

The Channel card on the Painel shows each state in pt-BR. For
`credential_rejected` and `removed`, the owner sees **Reconectar WhatsApp
Business**, which runs Embedded Signup again. It must select the same WABA and
number; the Channel, its Conversations and history are kept, the new
credential replaces the old one, and the app subscribes to the WABA again.
Another number is refused: changing numbers goes through support.

The [sweep](inbox-operations.md#the-sweep) lifts restrictions that have ended
and alerts the platform administrator once per new state.

## Live validation

Use the dedicated Brazilian demo WhatsApp Business number required by #37:

1. Sign in as the Tenant owner, read the pt-BR instructions, and click
   **Conectar WhatsApp Business**. Confirm the popup is permitted by the browser.
2. Select the existing Business app number and complete the phone confirmation.
   Confirm the callback/code can arrive in either order, and the connected number
   appears once, with the Bot off and the subscription confirmed.
   Spend more than three minutes in the Meta popup and confirm completion still
   works; there is no timeout while the owner navigates Meta. After either the
   code or session result arrives, a one-minute timeout bounds the wait for its
   complementary result.
3. Verify cancellation, denied permissions and blocked SDK/popups show a useful
   message; verify an attendant cannot launch signup or retry subscriptions.
4. Remove a required app field temporarily on the demo app, connect a fresh demo
   Tenant and verify the saved Channel shows an unconfirmed subscription. Restore
   the field and retry as owner. Confirm the Bot stays off.
5. Complete the broader #37 real-number gate: inbound/status delivery, app
   echoes, history/app-state events and app continuity. Verify both sharing
   and declining history in the app during signup, that imported Conversations
   and app contact names appear, and that no Bot activity follows. Explicitly check Windows/WearOS gaps. Do not infer this gate passed
   from automated tests or subscription success.

Automated checks use PGlite and fake Meta HTTP responses through the public
Channel service and WhatsApp adapter. They do not use a real number or grant.

## Official references

Consulted on 2026-10-20:

- [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
- [Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4)
- [Onboarding as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider)
- [Onboarding Business app users (coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [App subscription reference](https://developers.facebook.com/docs/graph-api/reference/app/subscriptions/)
