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
   History imports are separate work (#49); complete them before the live
   coexistence acceptance run.
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
Meta retries for up to seven days. An event still pending after that is
recovered by the administrator replay in #48. Redelivery can enqueue a duplicate
job for an event that is already queued; processing treats it as a no-op.

QStash calls `POST /api/jobs/process-inbox-event`. The route rejects requests
without a valid `Upstash-Signature` for that exact URL and body (401) and payloads
other than an id (400). Processing resolves the Tenant only from the Channel
whose phone-number-id the event names. A text message becomes the Contact (unique
per Tenant and phone), their Conversation on that Channel, and the message
(unique per wamid). Events for an unknown phone-number-id are marked `ignored`
(`unknown_channel`) and create nothing. So are events not handled yet
(`unsupported_event`: statuses, echoes, edits, media, history; see #45, #46,
#49, #61). Processing is idempotent, so QStash retries and duplicate jobs are
safe. A job that keeps failing goes to QStash's dead-letter queue; inspecting
and replaying those is #48.

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
5. After webhook/history work lands, complete the broader #37 real-number gate:
   inbound/status delivery, app echoes, history/app-state events and app
   continuity. Explicitly check Windows/WearOS gaps. Do not infer this gate passed
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
