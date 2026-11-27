# Billing

Issues: [#253](https://github.com/danielluis07/clickstudio-bots/issues/253) (parent),
[#255](https://github.com/danielluis07/clickstudio-bots/issues/255) (switch, Trial and Suspended),
[#256](https://github.com/danielluis07/clickstudio-bots/issues/256) (extending a Trial),
[#257](https://github.com/danielluis07/clickstudio-bots/issues/257) (subscribing),
[#258](https://github.com/danielluis07/clickstudio-bots/issues/258) (failed charges, Grace period, reconciliation),
[#259](https://github.com/danielluis07/clickstudio-bots/issues/259) (changing the card),
[#260](https://github.com/danielluis07/clickstudio-bots/issues/260) (cancelling).
Decision: [ADR 0012](adr/0012-mercado-pago-subscriptions-with-card-payment-brick.md).
Terms: `GLOSSARY.md` → Billing.

Code: `modules/billing/` (the domain, and the `SubscriptionGateway` port in
`gateway.ts`), `platform/mercado-pago.ts` (the Mercado Pago adapter and the
webhook signature check), `server/mercado-pago-webhook.ts` (the webhook route)
and `server/billing-subscription.ts` (the subscribe, change-card and cancel
actions).

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
again with no sweep needed. A Tenant Suspended after its Grace period still
has its `authorized` Subscription, so extending is refused for it and only a
successful charge lifts that suspension. Once Mercado Pago has cancelled or
paused that Subscription, extending is no longer refused, as for any Tenant
without an active Subscription.

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
and it doesn't pay for the Plan (`paysForPlan` in
`modules/billing/subscriptions.ts`). A Tenant pays for the Plan while it has
a Subscription whose Mercado Pago status is `authorized` and no overdue
charge, or a [Grace period](#grace-period) still running. So a Tenant is
Suspended when its Trial ends without a Subscription, when its Grace period
ends unpaid, and when Mercado Pago cancels or pauses its Subscription (at the
end of the Grace period if one is running). Canceled Tenants are left alone.

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

## Changing the card

Once the Tenant has a Subscription that isn't `cancelled` (a paused one
included), the billing page shows the card that pays it under "Cartão",
masked: the brand Mercado Pago names (`payment_method_id` on the
preapproval) and the last 4 digits, as in "Visa •••• 3311". Mercado Pago
returns no digits of the card, so the last 4 come from the Card Payment
Brick's `AdditionalData.lastFourDigits`, sent with the token. They are kept
only for display (`subscription.card_last_four`), and anything but 4 digits
is dropped. Both are also stored when subscribing.

"Alterar cartão" opens the Brick again. Only the owner sees it, as for
subscribing. `billing.changeCard` sends `PUT /preapproval/{id}` with the new
`card_token_id` ("Alterar cartão do meio de pagamento primário" in Mercado
Pago's subscription management docs). The Subscription keeps its row, its
`preapproval` id, its amount and its next charge date. A paused Subscription
is also sent `status: "authorized"`, so the new card resumes it. A 4xx is
reported as a refused card and the old card stays; an unreachable Mercado
Pago is reported as `billing_change_card_failed`.

**During a Grace period** this is how the owner fixes a failed charge. The
billing page asks for a new card, before and after the Tenant is Suspended.
Mercado Pago's docs don't say whether changing the card charges the overdue
amount at once or waits for the next retry, so nothing is charged by us: the
next retry charges the new card, and that charge ends the Grace period and
any suspension like any successful charge (see below). The owner is told the
overdue charge will be made on the new card at Mercado Pago's next try.

## Cancelling

**The owner cancels** from "Cancelar assinatura" on the billing page, shown
only to the owner and only for a Subscription that isn't `cancelled`, after a
confirmation (`billing.cancelSubscription`). The `preapproval` is cancelled at
once (`PUT /preapproval/{id}` with `status: "cancelled"`), so Mercado Pago
never charges it again. There are no refunds for part of a month: the Tenant
keeps its Bot until the end of the month already paid for, and the next sweep
run after that Suspends it.

That date is stored in `subscription.paid_until`. Before cancelling,
`GET /preapproval/{id}` is read and applied, so a charge whose webhook was
lost still counts, and its `next_payment_date` becomes `paid_until`: the
Trial end for a Subscription made during the Trial, otherwise the end of the
month the last charge paid for. A `cancelled` Subscription with `paid_until`
in the future still pays for the Plan (`paysForPlan`). With a charge overdue
nothing is paid for: `paid_until` stays null and the Bot stops when the
[Grace period](#grace-period) ends. A Subscription Mercado Pago cancelled by
itself, or one cancelled while the Tenant is Suspended, gets no `paid_until`
either. `paid_until` is written before Mercado Pago is called and kept if the
call fails: it only counts once the status is `cancelled`, so a cancellation
Mercado Pago made but answered too late still keeps the paid month.

After cancelling, the billing page shows "Bot ativo até" with the date the
Bot stops, and the card form again. **Subscribing again before that date**
sets `start_date` to `paid_until` (or the Trial end, whichever is later), so
the new Subscription's first charge is on the day the paid month ends, and
nothing is charged twice. With a charge overdue, subscribing again charges at
once, as while Suspended.

If Mercado Pago can't be reached, nothing changes, `billing_cancel_failed` is
reported, and the owner is asked to try again.

**A canceled Tenant** (`organization.canceled_at`, `bun run tenant:cancel`)
has its Subscription cancelled immediately (`cancelForCanceledTenants`), with
billing on or off: the cancel command does it right after canceling the
Tenant, and exits with code 2 if Mercado Pago fails. The sweep's
`cancel-canceled-tenant-subscriptions` task then retries every 30 minutes
until it succeeds, so a failure is never dropped. `paid_until` is kept as for
an owner's cancellation, so a Tenant reactivated within its recovery window
keeps its Bot for the month it paid for, and then must subscribe again.

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

5. **A refused charge starts the Grace period** (below). It arrives as a
   `rejected` payment, through either payment signal above.

Anything but 200 makes Mercado Pago retry (every 15 minutes, then less
often), so a failed fetch answers 500 and is reported as
`billing_notification_failed`. Unconfigured, the route answers 503.

## Grace period

When a monthly charge is refused, the Tenant gets 7 days (`graceDays`) while
Mercado Pago retries the card. Its Bot keeps replying. The end is stored in
`subscription.grace_ends_at`: the refused payment's `date_created` + 7 days.

- **It starts** on a `rejected` payment for at least the Subscription's
  amount (a refused card check doesn't count). It starts only once, only if
  the refusal is newer than the last successful charge
  (`subscription.last_charged_at`, so a replayed refusal starts nothing), and
  not while the Tenant is already Suspended.
- **It ends** with a successful charge made after it started: a retry, or a
  charge on a new card ("Alterar cartão", #259). The charge clears
  `grace_ends_at` and lifts a suspension that began before it. Each of the
  three charge signals counts.
- **When it ends unpaid**, the next sweep run Suspends the Tenant (at most 30
  minutes later). A retry that succeeds after that still ends the suspension,
  and so does one that succeeded in time but was reported only after the
  sweep had Suspended the Tenant.
- **If Mercado Pago cancels or pauses** the Subscription once its retries are
  used up, the Tenant keeps its Bot until the Grace period ends and is then
  Suspended.

While a Grace period is running, the billing page shows "Bot ativo até" with
its end. Subscribing again over a cancelled Subscription starts with no
Grace period.

## Reconciliation

Webhooks can be lost, so before it enforces anything the sweep's
`enforce-billing` task re-reads from Mercado Pago (`reconcile` in
`modules/billing/subscriptions.ts`) what a notification would have said.
To keep each run cheap (ADR 0011), it reads only `authorized` Subscriptions
whose charge is due (`next_charge_at` has passed: a successful charge moves
it a month ahead) or that have a Grace period. A Subscription on Trial,
already charged this month, cancelled or paused costs nothing, and with
billing off nothing is read.

For each one, three calls:

1. `GET /preapproval/{id}`: the status (a cancellation or pause Mercado Pago
   made), the next charge and `summarized.last_charged_date`, applied as a
   `subscription_preapproval` notification would be;
2. `GET /authorized_payments/search?preapproval_id=…`: the newest monthly
   charge;
3. `GET /v1/payments/{id}` for its payment, applied as a payment
   notification would be. A refusal starts the Grace period and an approval
   ends it.

The writes are the same idempotent ones as for notifications, so a sweep
that runs while a webhook arrives changes nothing more. A run re-reads at
most 100 Subscriptions, the ones re-read longest ago first
(`subscription.reconciled_at`). The first failed call ends the run: Mercado
Pago is likely down, and waiting out a 10-second timeout per Subscription
would use up the sweep's 60-second limit before the Bot's own recovery. The
failed Subscription goes to the back of the queue, so it doesn't block the
others next run. Either way the task still Suspends from what is stored,
then reports `sweep_task_failed`.

A Tenant Suspended after its Grace period keeps an `authorized`
Subscription with a Grace period until Mercado Pago cancels or pauses it,
so it is re-read every run. That costs three Mercado Pago calls and no extra
database work, and it is how a late retry with a lost webhook is found.

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

Checked on 2026-11-27, for the Grace period and reconciliation:

- **Retries**: the docs only say "automatic retries if a payment is
  rejected". They give no count, no window, and don't say whether Mercado
  Pago cancels or pauses the Subscription when retries run out, or whether
  `next_payment_date` moves after a refusal. The Grace period therefore
  depends on none of these: it is 7 days from the refusal, whatever Mercado
  Pago does, and both cancelled and paused are handled. If `next_payment_date`
  does move after a refusal whose webhook is lost, the sweep stops seeing
  the charge as due and finds the refusal only at the next charge date or
  through a later notification.
- **`summarized.last_charged_date` and `last_charged_amount`**: the docs
  don't say whether they count only successful charges. They are read as a
  successful charge, as since #257. Confirm on a refused renewal that they
  don't move.
- **A paused Subscription**: the owner can't subscribe again over it (only a
  `cancelled` one is replaced), so a Tenant Suspended with one needs
  "Alterar cartão", which also sends `status: "authorized"`, or a
  cancellation.
- **Which webhook a refusal fires**: not documented. The adapter treats a
  `rejected` payment as the refusal, whether it arrives as `payment` or
  through `subscription_authorized_payment`. Confirm it in the sandbox with
  a renewal charge that is refused.
- **`summarized.semaphore`**: only the value `green` appears, with no
  meanings, so it isn't used.
- **Invoice search order**: `GET /authorized_payments/search` takes
  `preapproval_id` but documents no sort. The adapter picks the newest by
  `date_created`, and when there is more than one page it reads the last page
  (`offset`, `limit`), assuming the oldest come first. Confirm this on a
  Subscription with many charges.

Checked on 2026-11-27, for changing the card:

- **The card change**: settled. `PUT /preapproval/{id}` with `card_token_id`.
- **Card details on the preapproval**: the reference shows `card_id` and
  `payment_method_id`, with no last digits or first digits. The last 4 come
  from the Brick's `AdditionalData`, which `sdk-js`'s
  `docs/bricks/card-payment.md` types as `bin`, `lastFourDigits`,
  `cardholderName` and `paymentTypeId`. Confirm the live Brick passes it.
- **The overdue charge after a card change**: not documented, neither an
  immediate charge nor a retry schedule. Confirm in the sandbox that a
  refused renewal is retried on the new card, and how soon.
- **Resuming a paused Subscription**: the management docs pause and
  reactivate with `status`. Confirm that a Subscription Mercado Pago paused
  after failed retries accepts `status: "authorized"` with a new card.
