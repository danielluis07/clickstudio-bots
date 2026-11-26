# Billing

Issues: [#253](https://github.com/danielluis07/clickstudio-bots/issues/253) (parent),
[#255](https://github.com/danielluis07/clickstudio-bots/issues/255) (switch, Trial and Suspended),
[#256](https://github.com/danielluis07/clickstudio-bots/issues/256) (extending a Trial).
Decision: [ADR 0012](adr/0012-mercado-pago-subscriptions-with-card-payment-brick.md).
Terms: `GLOSSARY.md` → Billing.

Code: `modules/billing/`. Owners can't subscribe yet. That comes in #257.

## The switch

`BILLING_ENABLED` (`platform/env.ts`) is set per environment. It is off by
default and stays off in production until launch. Dev and preview run with it on.

With the switch **off**:

- New Tenants get no Trial end, and no Trial counts down.
- The sweep Suspends nobody, and it lifts any suspension left from when the
  switch was on. The banner goes at once, but the Bot of a Tenant Suspended
  before the switch went off replies again only after that sweep run, up to
  30 minutes later.
- Members see no billing banner, and the billing page (`/painel/assinatura`)
  is not found.
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
Subscription has no Trial to extend and is refused; until #257 the check is
the same stub the sweep uses.

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
and it has no active Subscription. Until #257 no Tenant has a Subscription, so
the check is a stub that always says none. Canceled Tenants are left alone.

While a Tenant is Suspended:

- Its Bot doesn't reply. Suspension is part of `botEligible`
  (`modules/conversations/bot-eligibility.ts`), so the reply gate, the
  reservation and the sweep's Bot recovery all agree. Conversations stay with
  the Bot and are answered once the suspension is lifted.
- Contact messages are still received and stored, and Members still open
  Conversations and send replies: `activeTenant` (`modules/channels`) ignores
  suspension.
- Every Member sees a banner above the dashboard. Only the owner's banner
  links to the billing page, which says "Em breve" until #257.

Suspended is separate from a canceled Tenant (`canceled_at`) and from a Bot
the owner paused (`channel.bot_paused`).
