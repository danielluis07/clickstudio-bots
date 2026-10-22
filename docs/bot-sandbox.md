# Testing the Bot in the dashboard

Issue: [#55](https://github.com/danielluis07/clickstudio-bots/issues/55).

The Tenant owner opens **Painel → Bot → Testar Bot** (`/painel/bot`) and writes
as a sandbox Contact. No connected Channel or activated Bot is required. Other
Members cannot use the sandbox; the module and tRPC endpoint both enforce this.

Each reply calls `createBotCore` with the same `Model` contract, prompt rendering,
context limits and capability validation used by production and evaluation.
`readBehaviour` and `readKnowledgeBase` load the current saved data for every turn.
Unsaved edits do not apply. The sandbox deliberately previews replies regardless
of the production Schedule, Channel pause or Conversation ownership.

## Isolation

The transcript lives only in the page's React state and disappears on navigation
or reload. The browser submits at most 20 prior messages, with a `contact` or `bot`
author, never production Contact, Conversation or Tenant identifiers. The service
validates this bounded input again and supplies it to the core as sandbox context.
Each submitted message is limited to 4,096 characters; each history entry to 8,000.

The sandbox has no WhatsApp sender, production usage meter, notifier or repository
that writes Contacts or Conversations. A Handoff is displayed as a simulation;
the owner can continue testing afterward. The current production catalog offers
only `handoff`: attempted capture or send tools are rejected by the same core
validation and cannot modify production records. Adding a capability to the core
must preserve this isolation before exposing its effects in the sandbox.

Only a daily counter is persisted in `bot_sandbox_usage`: one row per Tenant,
containing its day and attempted-turn count, with deletion cascading from the
Tenant. No transcript, Contact fields or model output is stored there.

## Daily cap

The bounded implementation setting is **50 attempted turns per Tenant per day**,
shared by all owners, tabs and service instances. It resets at midnight in
`America/Sao_Paulo`, independently of the production monthly reply allowance.
Provider errors and invalid-tool retries belong to the reserved turn; the retry
does not consume another turn. Invalid input, unauthorized requests and a missing
provider configuration consume no allowance.

A conditional upsert reserves the attempt before the Model call. No database
transaction or row lock is held during that external call. At the cap the endpoint
returns `TOO_MANY_REQUESTS` with a pt-BR explanation and does not call the Model.
The browser refreshes the count after each attempt and on focus/reconnect. Its
composer remains usable so a new request after midnight can reach the server even
if the displayed count is stale.

## Setup and verification

Set `ANTHROPIC_API_KEY` to enable the existing AI SDK Model adapter. The sandbox
uses that adapter's existing default model and timeout settings. With no key, the
UI explains in pt-BR that testing is temporarily unavailable and disables sending.
No provider credentials reach the browser.

Run `bun run db:migrate` before deploying; the migration adds only the separate
sandbox counter table. Automated tests use migrated PGlite and the deterministic
Model fake, requiring neither provider credentials nor WhatsApp access. They
cover current saved data, context replay, capability validation, network and
production-record isolation, failed providers, the daily reset, Tenant separation,
owner authorization and the pt-BR cap refusal. Production reply counting is not
implemented yet; isolation is enforced by never supplying its meter or send path
to the sandbox.
