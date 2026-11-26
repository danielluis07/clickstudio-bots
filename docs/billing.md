# Billing

Issues: [#253](https://github.com/danielluis07/clickstudio-bots/issues/253) (parent),
[#255](https://github.com/danielluis07/clickstudio-bots/issues/255) (switch, Trial and Suspended),
[#256](https://github.com/danielluis07/clickstudio-bots/issues/256) (extending a Trial),
[#257](https://github.com/danielluis07/clickstudio-bots/issues/257) (subscribing).
Decision: [ADR 0012](adr/0012-mercado-pago-subscriptions-with-card-payment-brick.md).
Terms: `GLOSSARY.md` → Billing.

Code: `modules/billing/` (the domain, and the `SubscriptionGateway` port in
`gateway.ts`), `platform/mercado-pago.ts` (the Mercado Pago adapter and the
webhook signature check), `server/mercado-pago-webhook.ts` (the webhook route)
and `server/billing-subscription.ts` (the subscribe action).

## The switch

`BILLING_ENABLED` (`platform/env.ts`) is set per environment. It is off by
default and stays off in production until launch. Dev and preview run with it on.

With the switch **off**:

- New Tenants get no Trial end, and no Trial counts down.
- The sweep Suspends nobody, and it lifts any suspension left from when the
  switch was on. The banner goes at once, but the Bot of a Tenant Suspended
  before the switch went off replies again only after that sweep run, up to
  30 minutes later.
- Members see no billing banner. The billing page (`/painel/assinatura`) is
  not found, except for a platform administrator who owns a Tenant, so the
  flow can be tried before launch. With no Trial counting down, such a
  Subscription is charged at once.
- Mercado Pago's webhooks are still processed.
- `bun run billing:launch` refuses to run.
- `/admin` shows no Trials, and extending one is refused.

## The Trial

Each Tenant has a Trial end (`organization.trial_ends_at`):

- A Tenant created while billing is on gets its creation time + 30 days.
- A Tenant created while billing is off gets none until launch.

## Extending a Trial

The platform administrator extends one Tenant's Trial from `/admin`, under
"Períodos de teste" (`extendTrial` in `modules/billing/billing.ts`). They pick
the Trial's last day, and the Trial ends at the following midnight in
Brasília. The new end must be in the future. A Tenant with an active
Subscription has no Trial to extend and is refused.

Extending also lifts the Tenant's suspension at once, so its Bot replies
again with no sweep needed. Today a Trial ending is the only reason a Tenant
is Suspended. When the Grace period arrives (a failed charge), its suspension
comes with a Subscription, and #258 must keep extending from lifting it.

Each extension is recorded in the activity log as `trial.extended`, with the
administrator as actor ([Member activity](member-activity.md)).

## Launching

Once the switch is on in an environment, run the launch action with that
environment's `DATABASE_URL` and `BILLING_ENABLED=true`:

```sh
bun run billing:launch admin@example.com
```

It checks that the email belongs to a platform administrator. Then it gives
every Tenant without a Trial end now + 30 days. Tenants that already have
one, including those created after the switch went on, keep theirs. Running
it again changes nothing.

## Suspended

The sweep's `enforce-billing` task ([the sweep](inbox-operations.md#the-sweep))
marks a Tenant Suspended (`organization.suspended_at`) once its Trial has ended
and it has no active Subscription (one whose Mercado Pago status is
`authorized`). Canceled Tenants are left alone.

While a Tenant is Suspended:

- Its Bot doesn't reply. Suspension is part of `botEligible`
  (`modules/conversations/bot-eligibility.ts`), so the reply gate, the
  reservation and the sweep's Bot recovery all agree. Conversations stay with
  the Bot and are answered once the suspension is lifted.
- Contact messages are still received and stored, and Members still open
  Conversations and send replies: `activeTenant` (`modules/channels`) ignores
  suspension.
- Every Member sees a banner above the dashboard. Only the owner's banner
  links to the billing page.

Suspended is separate from a canceled Tenant (`canceled_at`) and from a Bot
the owner paused (`channel.bot_paused`).

## Subscribing

The Plan is R$ 99,90 a month (`planAmountCents` in
`modules/billing/subscriptions.ts`), credit card only, in one installment.
The owner opens "Assinatura" in the sidebar (`/painel/assinatura`), shown only
to whoever may subscribe. Admins and members get a 404 for the page and
`forbidden` from the action.

The page shows the Plan, the Trial end or the Subscription's status and next
charge, the payer email (pre-filled with the owner's login email, editable)
and Mercado Pago's **Card Payment Brick**. The Brick loads from
`https://sdk.mercadopago.com/js/v2` (`useCardPaymentBrick`), runs in Mercado
Pago's iframe and turns the card into a token there. Only that token and the
payer email reach `subscribeAction`; card data never reaches our server.

`billing.subscribe` then creates a `preapproval` with the card token, the
Plan's amount in BRL, a monthly frequency, `external_reference` set to the
Tenant's id and `status: "authorized"`:

- **During the Trial**, `start_date` is the Trial end, so the first charge is
  on that day.
- **While Suspended** (or with billing off, or a Trial that ended before the
  sweep ran), there is no `start_date`, so the card is charged at once. The
  suspension ends when that charge's approval arrives (see below), not when
  the Subscription is created.

The Subscription is stored in `subscription`: one row per Tenant, holding the
`preapproval` id, Mercado Pago's status, the payer email, the amount and the
next charge date. A Tenant whose Subscription isn't `cancelled` can't
subscribe again; a cancelled one is replaced. If two subscribes race, one row
wins and the other `preapproval` is cancelled at Mercado Pago. A `preapproval`
that Mercado Pago doesn't authorize at once is cancelled and reported to the
owner as a refused card.

## Mercado Pago notifications

`POST /api/webhooks/mercado-pago` receives the `subscription_preapproval`,
`subscription_authorized_payment` and `payment` topics:

1. **Signature.** `x-signature` is `ts=<seconds>,v1=<hex>`: the HMAC-SHA256,
   keyed with `MERCADO_PAGO_WEBHOOK_SECRET`, of
   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, with any pair whose value
   is missing left out. This follows the official Node SDK's
   `WebhookSignatureValidator`. The id is `data.id` from the query string,
   else from the body, else the `?id=` of legacy "Pagamentos (legacy)"
   notifications. It is accepted as received or in lowercase (the docs ask
   for lowercase alphanumeric ids, while the SDK signs them as received). A bad
   signature gets 401. There is no timestamp tolerance: retries aren't
   documented to be re-signed, and a replay changes nothing.
2. **Fetch, never trust the body.** The topic decides what is fetched:
   `GET /preapproval/{id}`, `GET /authorized_payments/{id}` and then its
   payment, or `GET /v1/payments/{id}`. A resource that isn't one of our
   Subscriptions is ignored, as are other topics.
3. **Apply idempotently.** A preapproval's state is stored unless a newer
   one (Mercado Pago's `last_modified`) already is. So a repeated or
   out-of-order notification changes nothing more, and no dedupe table is
   needed.
4. **An approved charge ends a suspension.** A charge of one of our
   Subscriptions, for at least the Subscription's amount and made after the
   Tenant was Suspended, clears `suspended_at`, and the Bot replies again.
   Mercado Pago's small card check doesn't count, and neither does a
   replayed payment from before the suspension. Three signals carry a charge,
   so a missing topic or field doesn't leave a paying Tenant Suspended:
   - an `approved` payment, found through its authorized payment;
   - an `approved` payment linked to the Subscription
     (`point_of_interaction.transaction_data.subscription_id` or
     `metadata.preapproval_id`), or else to the Tenant through its
     `external_reference`;
   - the preapproval's own `summarized.last_charged_date` and
     `last_charged_amount`, read on every `subscription_preapproval`
     notification.

Anything but 200 makes Mercado Pago retry (every 15 minutes, then less
often), so a failed fetch answers 500 and is reported as
`billing_notification_failed`. Unconfigured, the route answers 503.

## Mercado Pago setup

Env vars (`platform/env.ts`), per environment:

| Variable | Value |
| --- | --- |
| `BILLING_ENABLED` | `true` in dev and preview; `false` in production until launch |
| `MERCADO_PAGO_ACCESS_TOKEN` | Server-only access token (test credentials outside production) |
| `MERCADO_PAGO_PUBLIC_KEY` | The public key the Brick uses; handed to the browser |
| `MERCADO_PAGO_WEBHOOK_SECRET` | "Assinatura secreta" from Suas integrações → Webhooks |

Without the access token, the page says billing isn't configured and the
webhook answers 503. Without the secret, the webhook answers 503.

In Suas integrações → Webhooks, point each environment at
`<APP_URL>/api/webhooks/mercado-pago` and enable `subscription_preapproval`
(Planos e assinaturas), `payment` ("Pagamentos (legacy)") and
`subscription_authorized_payment` if the panel offers it.

### Testing with test cards

With test credentials, subscribe from `/painel/assinatura` using Mercado Pago's
Brazilian test cards (expiry `11/30`):

| Card | Number | CVV |
| --- | --- | --- |
| Mastercard | 5480 8328 0103 3311 | 123 |
| Visa | 4235 6477 2802 5682 | 123 |
| American Express | 3753 651535 56885 | 1234 |

The cardholder name picks the outcome: `APRO` approves and `OTHE` refuses
(others such as `FUND` and `SECU` refuse for a given reason). Use CPF
`12345678909`. To test the Suspended path, let a Tenant's Trial end (or set
`trial_ends_at` in the past), run the sweep, then subscribe.

### What Mercado Pago's docs do and don't settle

Checked on 2026-11-26 against the developer docs, the API reference and the
Node SDK's source:

- **Signature format**: settled, as above.
- **Card check**: Mercado Pago charges a minimum amount to validate the card
  and refunds it. The docs give no figure. That payment is ignored because it
  is below the Plan's amount.
- **`start_date` up to 30 days ahead**: the docs give no limit and don't say
  what a future `start_date` does to the first charge. Without one, the first
  installment is charged about an hour after the Subscription is created.
  Confirm in the sandbox that a Trial-end `start_date` (up to 30 days, or more
  after an extension) is accepted and charges on that day.
- **Which payment belongs to a Subscription**: the documented path is
  `subscription_authorized_payment` → `GET /authorized_payments/{id}`, which
  names the `preapproval_id`. For bare `payment` notifications the adapter
  reads `point_of_interaction.transaction_data.subscription_id` (or
  `metadata.preapproval_id`), which isn't in the payments reference. Confirm
  it against a real test charge.
- **Sandbox payer email**: the docs don't say whether it must belong to a
  test user. If the sandbox refuses the owner's email, use the test buyer's.
