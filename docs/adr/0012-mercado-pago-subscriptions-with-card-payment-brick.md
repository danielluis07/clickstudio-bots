---
status: accepted
---

# Bill Tenants with Mercado Pago subscriptions, paid through an embedded Card Payment Brick

Tenants pay one flat monthly Plan by credit card. We charge them through Mercado Pago's Subscriptions API (`preapproval`). The owner enters their card in a Card Payment Brick on our own billing page: the Brick turns the card into a token in the browser, and our server creates the subscription with that token. Mercado Pago charges the card every month, retries failed charges, and tells us the results by webhook. The owner already had a Mercado Pago account, and a fixed monthly charge is exactly what `preapproval` is built for.

All of it ships behind a per-environment switch, and production stays off until the owner decides to start charging. **No Trial counts down while billing is off.** Turning it on gives every Tenant that exists at that moment 30 days starting that day. Tenants created after that get 30 days from their own creation. Without this rule, Tenants that signed up long before launch would be Suspended on launch day.

## Considered Options

- **Mercado Pago hosted checkout** (redirect to Mercado Pago's page): rejected in favour of the Brick, so the owner never leaves the dashboard. Card data still never reaches our servers, because the Brick tokenizes it inside Mercado Pago's iframe.
- **Stripe Billing:** a stronger subscription model, but the owner has no Stripe account, and Mercado Pago is better known to Brazilian small businesses.
- **Asaas or Pagar.me with Pix Automático or boleto:** would reach Tenants without a credit card, but adds a provider the owner doesn't use. Mercado Pago `preapproval` charges only cards (or a Mercado Pago account balance), so Tenants without a card can't subscribe for now.
- **Usage-based price** (per Bot reply or Active Conversation): rejected. `preapproval` charges a fixed amount, and the existing 5,000-reply monthly allowance already limits cost.

## Consequences

- Webhooks are the main signal. The sweep re-checks open Subscriptions against Mercado Pago and enforces the Trial and Grace period deadlines, so a lost webhook only delays a status change.
- Raising the Plan price doesn't change existing Subscriptions. Moving them to the new price is a deliberate step, taken with notice.
- Nota fiscal is out of scope. Mercado Pago's receipt email and our payment history are all a Tenant gets.
