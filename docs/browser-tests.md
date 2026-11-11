# Browser tests

A small Playwright suite drives a production build of the app in Chromium,
against a seeded local database and a fake Meta Graph API. It covers what the
module and action tests cannot: that pages render, that guards redirect in a
real browser and that Cache Components serve the protected segments.

| Flow | File |
| --- | --- |
| Sign in and land on the Painel; a wrong password shows the pt-BR error | `test/e2e/sign-in.e2e.ts` |
| Signed-out and forged-cookie visits to `/painel` and `/admin` reach `/entrar` | `test/e2e/guards.e2e.ts` |
| Accept an owner invitation, Terms checkbox included | `test/e2e/invitation.e2e.ts` |
| Open a Conversation and send a reply through the fake Meta | `test/e2e/inbox.e2e.ts` |
| A Member cannot open another Tenant's Conversation by id | `test/e2e/inbox.e2e.ts` |
| The owner reaches Configurações from the sidebar and sees Canal, Equipe and Termos aceitos | `test/e2e/settings.e2e.ts` |
| The owner's Painel shows Primeiros passos, the KPI row, both charts and the Handoff list, and the period selector changes the stats but not the reply meter | `test/e2e/overview.e2e.ts` |

Spec files end in `.e2e.ts`, not `.spec.ts` or `.test.ts`, so `bun test`
does not pick them up.

## How a run works

`bun run test:e2e` runs `playwright test`, which:

1. starts `test/e2e/fake-graph.ts`, a Bun server on port 3101 that accepts
   every WhatsApp text send and records it at `/__e2e/sends`;
2. runs `bun run build` and starts the app on port 3100 with the environment
   in `test/e2e/environment.ts`;
3. runs `scripts/seed-e2e.ts` from the global setup. It deletes the suite's
   earlier Tenants (slug `e2e-…`) and users (`@e2e.example.com`), then creates
   two Tenants with a Channel and a Conversation each, and a third whose owner
   invitation is pending. It goes through the real onboarding module and
   prints the ids the tests use;
4. runs the flows with one worker.

## No real vendors

- **Meta.** `META_GRAPH_API_URL` points the WhatsApp adapter at the fake. The
  seed encrypts a fake token with the suite's own key, and the inbox test
  checks that the fake received it. Production never sets this variable.
- **Model, Ably, QStash, Sentry.** Set to an empty value, which the app treats
  as unset (`emptyStringAsUndefined` in `platform/env.ts`). That also
  switches off whatever a developer's `.env` configures.
- **Resend.** A placeholder key satisfies env validation; no flow sends email.
- **Browser.** Each page refuses requests to any origin other than the app,
  such as the Facebook SDK.

The Bot does not run without QStash, so no flow calls a Model.

## Running locally

The suite needs a local Postgres with the migrations applied. It refuses a
non-local `E2E_DATABASE_URL`.

```powershell
$env:E2E_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/clickstudio_e2e"
$env:DATABASE_URL = $env:E2E_DATABASE_URL; bun run db:migrate
bunx playwright install chromium
bun run test:e2e
```

Ports 3100 and 3101 must be free. Each run makes a fresh production build in
`.next`, which `next dev` (in `.next/dev`) does not share. A failed run keeps a
trace: open it with `bunx playwright show-report`.

## In CI

The **Browser tests** job in `.github/workflows/ci.yml` runs on every push and
pull request, including from forks, because it needs no secrets: Postgres is a
service container. It is a required check in
[`.github/rulesets/main.json`](../.github/rulesets/main.json), so a failing
flow blocks the merge. On failure, the job uploads the Playwright report as an
artifact.
