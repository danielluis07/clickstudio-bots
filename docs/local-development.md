# Local readiness and branch protection

## Local readiness

Run `bun run doctor` before a browser check. Bun loads the local `.env`. The
command prints pt-BR diagnoses without environment values, Contact data, raw
database errors or provider error bodies. It exits with code 0 when all checked
prerequisites pass and 1 when any prerequisite fails.

```powershell
bun run doctor
bun run doctor --json
bun run doctor --help
```

The report checks:

- Presence of the required environment variables and valid database/app URL protocols.
- Selected provider and key presence, using Gateway precedence. This does not establish that a key is valid or the model is available.
- Database connectivity and applied migration names against this checkout's migration folders, matching the installed Drizzle migrator. Missing history counts as pending; migrations unknown to this branch also fail readiness.
- That `DATABASE_URL` connects as the application role: it cannot create or alter tables in `public`, and its sessions start with the expected `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout`. A failure names the settings that are missing or different; run `bun run db:app-role` (see [Database roles](../README.md#database-roles)).
- Presence of an owner membership. This does not verify a password or browser session.
- An HTTP 200 response from `/entrar` at the configured `APP_URL` origin.

Database inspection uses a short `BEGIN READ ONLY` transaction through a dedicated
`pg` client, compatible with the pooled endpoint. The command never applies
migrations, creates metadata tables, seeds a Tenant or changes records. Connection
and query timeouts bound database checks; the HTTP check times out after three
seconds. Dependent checks are skipped when their configuration or connection is
unavailable, while independent checks continue.

A stopped server is an expected failure: start it with `bun run dev`, then rerun
the report. Prepare missing prerequisites using the existing [setup](../README.md#setup)
and [demo Tenant](../README.md#demo-tenant) instructions. The doctor reports these
actions without running them.

### Optional provider probe

```powershell
bun run doctor --probe-provider
bun run doctor --probe-provider --json
```

This explicitly enables one synthetic Model request, which may incur a charge.
It uses the same provider factory, model, timeout, output cap and no-fallback
policy as the Bot, without saved Tenant content, tools or production metering.
It is refused when `CI` is set. Routine doctor runs and CI tests never call a
real Model.

The normal probe reads `AI_MODEL_ID`, just like the live Bot and sandbox. Set it
in your local `.env` to test an eligible model, then restart the development
server. See [model configuration](bot-sandbox.md#setup-and-verification) for
Gateway and direct Anthropic ID formats and production settings.

To test an alternative using your Gateway key without changing the Bot's model:

```powershell
bun run doctor --json --probe-provider --probe-model google/gemini-2.5-flash-lite
```

The override takes precedence over `AI_MODEL_ID` for this request only. It
requires both `--probe-provider` and `AI_GATEWAY_API_KEY`. It uses
Gateway's default provider routing, a 32-token output cap and no SDK retries.
The report identifies the alternative and leaves the Bot's model unverified.
This is a connectivity check, not an evaluation of tool use or reply quality.

AI Gateway's free credits cover only eligible models. A 403 can mean the selected
model requires purchased Gateway credits; upgrading the hosting plan is not the
prescribed fix. See [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing).

The probe separates key presence from actual model access: HTTP 401 reports an
authentication refusal; HTTP 403 reports a model-access refusal and points to
permissions and credits. Other failures return a generic diagnosis without raw
provider content. A successful probe establishes connectivity, not Bot quality;
the [provider evaluation](evaluation/README.md) remains a separate manual run.

The implementation starts at [`scripts/doctor.ts`](../scripts/doctor.ts).
Report decisions are in [`scripts/doctor/checks.ts`](../scripts/doctor/checks.ts),
and database, HTTP and Model adapters are in
[`scripts/doctor/adapters.ts`](../scripts/doctor/adapters.ts).

## Main branch protection

The active [Require PR and CI on main ruleset](https://github.com/danielluis07/clickstudio-bots/rules/25653122)
targets only `refs/heads/main`. Its request payload is tracked in
[`.github/rulesets/main.json`](../.github/rulesets/main.json).

The rule requires a pull request and a successful `check` context published by
GitHub Actions (integration id 15368), with the branch tested against the latest
base. It requires zero approving reviews, so a solo maintainer can merge after CI
passes. No bypass actors are configured.

The JSON file documents the setting; committing it does not apply GitHub rules.
Change the existing ruleset through repository settings or the rulesets API, then
keep this payload aligned. Renaming the CI job also requires updating its required
check context. To inspect the effective rules without changing them:

```powershell
gh api repos/danielluis07/clickstudio-bots/rules/branches/main
```
