# Manual provider evaluation

Implements [#52](https://github.com/danielluis07/clickstudio-bots/issues/52), using
the criteria recorded in #31 and #37. No live evaluation has been claimed.

The corpus factory in `scripts/provider-evaluation/corpus.ts` commits 81 synthetic
pt-BR cases, 27 each for a fictional barbershop, bakery and pet grooming business.
Their profiles, prices, policies, links and payment methods differ. All website
addresses use reserved `.example` domains; there is no real Contact data.

Cases cover known, unknown, mixed and contradictory answers; prices, hours and
policies; colloquial phrasing; bookings and payment commitments; discounts;
injection; attempts to address another Tenant or invent tools; capture requests;
explicit/rule-based Handoff; refusals; multi-turn and Member context; and tone.
Each Tenant also has a 30,000-character Knowledge base with a fact at its end,
and a cold/warm pair with the same prefix. Every live run gives the cold pair a
new synthetic revision id so its first prefix is new. Cache use still depends on
provider eligibility and must be checked in the measured cache-token buckets.

The tone case for each Tenant is also a **controlled tool-refusal recovery
probe**. It calls the real candidate once and retains its response unchanged for
raw-call scoring. Only the response delivered to the core is replaced with a
clearly recorded synthetic invalid `handoff` reason. The unchanged production
core refuses that call and requests its normal retry from the real candidate.
Both actual requests count toward latency, tokens and cost. The synthetic call
is stored as `injectedRefusal` and never attributed to the provider's schema or
scope score. This deliberate fault injection establishes recovery coverage even
when the candidate never emits an invalid call naturally. The first response's
text is not delivered; human review scores the final reply. Report probe results
separately from naturally occurring tool refusals; the 3 probe cases intentionally
stress the measured cost mix. An incomplete probe prevents a passing text result.

The harness calls `createBotCore` and the production `Model` contract. Its
repository is in-memory and contains only the synthetic Tenant for that case.
The isolated synthetic Channel proof never reaches a live repository. No
WhatsApp delivery, database writes or production allowance counting occurs.
Latency covers the complete core turn, including fixture reads and every model
attempt/tool-refusal round trip. Run from the intended hosting region and record
that environment; local latency is exploratory evidence only.

The current production tool catalog offers only `handoff`. Capture cases require
safe Handoff without inventing a capture tool. They do not certify the future
capture capability. Likewise, the 15 voice-note slots are a manual evidence
template, pending the production transcription path. Extend the corpus when
those capabilities land, then rerun the provider gate.

## Run manually

1. Copy `provider-config.example.json` to a local config. Supply an exact model id,
   actual hosting region and four nonnegative **BRL per million token** rates from
   a dated official price sheet. Record currency conversion and its source when
   needed. The example deliberately has null rates so it cannot imply current
   vendor pricing. Cache-write pricing must match the adapter's cache lifetime.
2. Set `ANTHROPIC_API_KEY` in the environment or local Bun `.env`. The built-in
   `anthropic` provider uses the same `createAiSdkModel` adapter as production.
3. Use a new output directory whose parent already exists:

```powershell
bun run evaluate:provider --help
bun run evaluate:provider --live --config ./provider-config.json --output ./evaluation-results/run-001
```

Create `evaluation-results` first if needed. Run sequentially to preserve the
cold/warm ordering. This is an explicitly paid manual command. It refuses `CI`;
neither the test script nor the GitHub Actions workflow invokes it. Tests inject
a deterministic fake Model and never need provider credentials.

For another provider, configure `adapterModule` with a path relative to the config
file. That trusted local TypeScript module must export
`createEvaluationModel({ modelId }): Model | Promise<Model>`, importing the `Model`
type from `@/modules/bot`. Install/configure that candidate's SDK outside routine
CI if needed. The factory must return raw calls and disjoint token/cache usage
through the production port, preserve malformed calls, reject on errors, and
avoid hidden retries. Changing provider must not replace the Bot core or scorer.
No provider or model names are inferred from the factory; record them accurately
in the config and results record.

The runner checkpoints `run.json` after each case and prints progress, then writes
`scores.json` and a blank `reviews.json`. The run includes the exact corpus,
rubrics, config/rates, revision, corpus hash, raw attempts, final outcomes, usage,
latency and cost. A crash leaves `complete: false`; rerun into a new directory.
Checkpoint writes are outside the measured latency. A provider exception is a
recorded failure and safe core Handoff, never a correct required Handoff.

## Score and review

Automatic gates count **all model attempts**, including rejected calls and
retries. Schema validity validates the raw input against the offered JSON Schema
before core validation/argument stripping. Unknown tools are invalid. Any nested
scope/identity argument is a cross-Tenant targeting attempt: the model must never
supply a Tenant, Conversation, Channel or Contact identity. Blocking an attempt
in production does not erase it from this evaluation.

Required Handoffs must have the expected reason: provider-failure Handoffs cannot
inflate that score. Unnecessary Handoffs divide by cases whose expected Handoff
is null, including refusals. Schema validity divides by calls, not cases; zero
calls means pending. Latency is nearest-rank p95 of full turns. Per-Tenant cost
uses the mean of that Tenant's case mix × 5,000, including all retry/cache usage.
One expensive Tenant cannot be hidden by averaging all three. Failed requests
make usage incomplete and the model-cost gate pending because their billable
usage is unavailable through the port.

Grounding and invented commitments require human review of the **delivered**
reply against the saved fixture and rubric. Rejected response text is retained
for inspection but was not sent. Fill the generated `reviews.json`: identify the
reviewer and ISO timestamp; assign each case `inventedCommitment`, `grounded`,
`tone` (integer 1–5), `naturalPtBr` and notes. `grounded` may be null only for
unanswerable cases. A wrong Handoff on an answerable case cannot count as a
grounded answer. Remove unreviewed rows to get pending partial scores rather
than invent ratings. Unknown/duplicate ids and mismatched run ids are rejected.

```powershell
bun run evaluate:provider --score ./evaluation-results/run-001/run.json --reviews ./evaluation-results/run-001/reviews.json
```

Offline scoring makes no provider calls and writes `scored.json`. Missing human
reviews keep the corresponding gates pending; one invented commitment fails
immediately. Offline scoring exits nonzero until all text gates pass. The live
command exits nonzero for measured failures; pending human review is expected.

Copy `results.template.md` to the run directory for the human decision, hosting
evidence, cache analysis and **combined** model/transcription projection. Copy
`voice-notes.template.json` for ~15 authorized informal/noisy pt-BR notes. Record
authorization locally, durations including billable minimums, transcription and
end-answer correctness, complete latency, token/cache/tool/audio usage and tone.
No audio has been supplied or evaluated by this implementation. The text runner
does not open recordings or contact a transcription service.

Treat the initial synthetic mix as a repeatable stress evaluation, not a measured
pilot traffic distribution. Record the mix and voice-share assumptions alongside
the 5,000-reply estimate. Refresh them with authorized anonymized pilot evidence.
Local artifacts are ignored by Git. Share only reviewed artifacts that satisfy
their data authorization; never commit real recordings, transcripts or credentials.
