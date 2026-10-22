# Testing the Bot in the dashboard

Issue: [#55](https://github.com/danielluis07/clickstudio-bots/issues/55).

The Tenant owner opens **Painel → Bot → Testar Bot** (`/painel/bot`) and writes
as a sandbox Contact. No connected Channel or activated Bot is required. Other
Members cannot use the sandbox; the module and tRPC endpoint both enforce this.

Before trying the UI, run `bun run doctor`; see
[local readiness](local-development.md) for prerequisites and the optional live
provider probe.

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
the owner can continue testing afterward. Attempted send or other uncatalogued
tools are rejected by the same core validation and cannot modify production
records. Contact capture keeps its details in the page and the request only; see
[Capturing Contact details](contact-capture.md#sandbox). Adding a capability to
the core must preserve this isolation before exposing its effects in the sandbox.

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

A conditional upsert reserves the attempt before the Model call. The stored day
only advances: a delayed prior-day reservation counts toward the later stored
day, so it cannot erase usage already reserved after midnight. No database
transaction or row lock is held during that external call. At the cap the endpoint
returns `TOO_MANY_REQUESTS` with a pt-BR explanation and does not call the Model.
The browser refreshes the count after each attempt and on focus/reconnect. Its
composer remains usable so a new request after midnight can reach the server even
if the displayed count is stale.

## Setup and verification

Set `AI_GATEWAY_API_KEY` in the local `.env` or deployment environment to enable
the existing AI SDK Model adapter through Vercel AI Gateway. Gateway uses
`anthropic/claude-haiku-5.5`, with routing restricted to Anthropic and no model
fallbacks. The current Haiku 5.5 model choice remains provisional pending provider
evaluation. The same prompt cache markers, timeout and token metering apply.

`ANTHROPIC_API_KEY` remains supported for direct Anthropic access when no Gateway
key is configured. If both are configured, Gateway takes precedence. A failed
Gateway call follows the core's safe Handoff path; it never retries via the direct
key or another provider. With neither key, the UI explains in pt-BR that testing
is temporarily unavailable and disables sending. Restart the development server
after changing keys. No provider credentials reach the browser.

The Gateway key's team must have access to the selected model. Gateway can return
HTTP 403 for Haiku 5.5 on its free tier, even when the key authenticates; enable
paid Gateway credits for that model before testing live replies. The application
handles this refusal through the same safe Handoff path as other provider errors.

The manual provider-evaluation runner still uses its explicitly configured direct
provider or local adapter module; see `docs/evaluation/README.md`.

Run `bun run db:migrate` before deploying; the migration adds only the separate
sandbox counter table. Automated tests use migrated PGlite and the deterministic
Model fake, requiring neither provider credentials nor WhatsApp access. They
cover current saved data, context replay, capability validation, network and
production-record isolation, failed providers, the daily reset, Tenant separation,
owner authorization and the pt-BR cap refusal. Production reply counting is not
implemented yet; isolation is enforced by never supplying its meter or send path
to the sandbox.

## Code entry points

Start with the public module interface, then follow its exports to the relevant
implementation. Code outside the module imports its public interface, following
[the dependency rules](CONVENTIONS.md#layout).

| Work | Start here |
| --- | --- |
| Bot public interface | [`modules/bot/index.ts`](../modules/bot/index.ts) |
| Reply decisions, context and capability validation | [`modules/bot/turn.ts`](../modules/bot/turn.ts) |
| Saved Behaviour settings and defaults | [`modules/bot/settings.ts`](../modules/bot/settings.ts) |
| Saved Knowledge base reads | [`modules/knowledge-base/index.ts`](../modules/knowledge-base/index.ts), then its `readKnowledgeBase` export |
| Sandbox isolation and daily allowance | [`modules/bot/sandbox.ts`](../modules/bot/sandbox.ts) |
| Provider selection and SDK adapter | [`platform/ai-sdk-model.ts`](../platform/ai-sdk-model.ts), wired by [`server/services.ts`](../server/services.ts) |
| Authenticated sandbox transport | [`trpc/routers/sandbox.ts`](../trpc/routers/sandbox.ts) |
| Browser state | [`modules/bot/hooks/index.ts`](../modules/bot/hooks/index.ts), then its `useBotSandbox` export |
| Dashboard UI | [`components/bot/bot-sandbox-chat.tsx`](../components/bot/bot-sandbox-chat.tsx) |
| Counter schema and migrations | [`db/schema/bot.ts`](../db/schema/bot.ts), [`drizzle/`](../drizzle/) |
| Public behaviour tests | [`test/modules/bot/sandbox.test.ts`](../test/modules/bot/sandbox.test.ts), [`test/trpc/router.test.ts`](../test/trpc/router.test.ts) |
