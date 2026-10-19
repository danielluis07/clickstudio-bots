# LLM cost per Conversation and provider options

Research for [LLM cost per Conversation and provider options](https://github.com/danielluis07/clickstudio-bots/issues/21), within [Wayfinder: is ClickStudio Bots viable, and what must be decided before the spec?](https://github.com/danielluis07/clickstudio-bots/issues/16). Checked 2026-10-19 against the linked primary sources. Planning evidence; no provider contract, model access, paid benchmark, implementation, or legal approval was obtained.

## Finding

Under the explicit workload below, uncached text inference costs about **$0.005 per ten-reply segment** on Haiku 5.5 or GPT-6 Luna, **$0.01648** on Gemini 3.5 Flash-Lite, and **$0.0992** on Sonnet 5.5. These are arithmetic estimates, not observed production costs. Inference alone does not appear to block viability at these volumes. Distribution, support, Meta fees and the eventual pricing decision remain separate.

The glossary's **Conversation** is a thread between one Contact and one Tenant on one Channel. It can continue indefinitely. A ten-reply segment is only the finite costing scenario in this note; it introduces no replacement domain definition or billing rule. A subscription cannot promise unlimited inference merely because an average Conversation looks cheap.

Suggested evaluation shortlist: Haiku 5.5 and GPT-6 Luna for the default Bot, Gemini 3.5 Flash-Lite as a comparison, Sonnet 5.5 as a higher-price reference. This is a research recommendation, **not a locked provider or routing decision**. No evidence here establishes which produces acceptable pt-BR answers for the selected niche.

## Verified model and price snapshot

USD per million text tokens, standard synchronous direct API, ordinary short context, before taxes, currency conversion or regional premiums. Subscription plans and consumer chat pricing do not fund this estimate.

| Provider/model ID | Uncached input | Output | Cache read | Cache write / storage |
| --- | ---: | ---: | ---: | --- |
| Anthropic `claude-haiku-5-5` | $0.10 | $0.50 | $0.01 | $0.125 five-minute write; $0.20 one-hour write |
| Anthropic `claude-sonnet-5-5` | $2.00 | $10.00 | $0.10 | $2.50 five-minute write; $4.00 one-hour write |
| OpenAI `gpt-6-luna` | $0.10 | $0.50 | $0.01 | $0.125 write |
| OpenAI `gpt-6.1-sol` | $2.00 | $10.00 | $0.10 | $2.50 write |
| Google `gemini-3.5-flash-lite` | $0.30 | $2.50 | $0.03 | Explicit cache storage $1 per million tokens/hour |
| Google `gemini-2.5-flash-lite` (budget comparator) | $0.10 | $0.40 | $0.01 | Explicit cache storage $1 per million tokens/hour |
| DeepSeek `deepseek-flash`, peak / off-peak | $0.30 / $0.15 | $1.20 / $0.60 | $0.006 / $0.003 | Automatic cache-hit/miss pricing |

Anthropic's official announcements verify Sonnet 5.5 (September 28) and Haiku 5.5 (October 7); these names are not assumptions. Haiku rates above apply to prompts up to 100,000 tokens; above that the rates increase. [Haiku announcement](https://www.anthropic.com/claude-haiku-5-5), [Sonnet announcement](https://www.anthropic.com/claude-sonnet-5-5), [Claude cache price table](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

OpenAI's current API table lists Luna and Sol at the rates shown. Regional processing adds 10% for eligible newer models. Batch/Flex prices are excluded because this scenario needs interactive replies. [Official OpenAI API pricing](https://developers.openai.com/api/docs/pricing).

Google lists both Flash-Lite generations, including caching and separately charged storage; output prices include thinking tokens. The older model is a price comparator, not a recommendation to ignore model lifecycle. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).

DeepSeek currently maps `deepseek-flash` to DeepSeek-V4.1-Flash-1017, supports tools and both thinking modes, and defaults to thinking. Peak hours are 01:00–04:00 and 06:00–10:00 UTC on Chinese working weekdays; all other times receive off-peak rates. It is a budget alternative to Sonnet, not cheaper than current Haiku/Luna on the baseline. [DeepSeek models and prices](https://api-docs.deepseek.com/quick_start/pricing/).

These live pages can change and historical pages/search snippets can disagree. Recheck exact API IDs, rate tiers, regional eligibility and account availability before procurement. No API request was sent to verify account access.

## Reproducible workload and cost

Assumptions chosen for planning, not measured pt-BR tokenization:

- Exactly ten Contact messages and ten Bot replies; ten inference requests.
- Each request repeats 1,000 tokens of system/Tenant instructions, 500 tokens of schema/protocol/format overhead, and 1,500 tokens of fresh retrieved Tenant knowledge: 3,000 fixed input tokens per request.
- Each Contact message is 80 tokens; each Bot reply is 160 billable output tokens. All prior Contact messages and Bot replies are replayed cumulatively. Fresh retrieval replaces the previous retrieval block; old retrieval blocks are not retained in message history.
- Application retrieval runs before inference. No model-initiated tool round trips, hosted search, images, audio, retries, fallback calls, compaction calls or additional reasoning tokens in the baseline. The 500-token schema allowance does not imply that actions have been approved for the MVP.

For request `k` (1 through 10):

```text
input(k) = 3000 + 80*k + 160*(k-1)
input sequence = 3080, 3320, 3560, 3800, 4040,
                 4280, 4520, 4760, 5000, 5240
total input = 10*3000 + 80*55 + 160*45 = 41,600
total output = 10*160 = 1,600
segment USD = (41,600*input_rate + 1,600*output_rate)/1,000,000
Tenant monthly USD = segment USD * monthly segment count
```

| Model/scenario | One segment | 100/month | 1,000/month | 10,000/month |
| --- | ---: | ---: | ---: | ---: |
| Haiku 5.5 / GPT-6 Luna | $0.004960 | $0.496 | $4.96 | $49.60 |
| Sonnet 5.5 / GPT-6.1 Sol | $0.099200 | $9.92 | $99.20 | $992.00 |
| Gemini 3.5 Flash-Lite | $0.016480 | $1.648 | $16.48 | $164.80 |
| Gemini 2.5 Flash-Lite | $0.004800 | $0.48 | $4.80 | $48.00 |
| DeepSeek Flash peak | $0.014400 | $1.44 | $14.40 | $144.00 |
| DeepSeek Flash off-peak | $0.007200 | $0.72 | $7.20 | $72.00 |

The requested 100/1,000/10,000 Conversations/month correspond to these totals **only if each Conversation fits one segment with no earlier replayed history**. If a Contact returns to an existing Conversation, count the actual inference requests and replayed context, rather than multiplying distinct threads. Monthly figures are per Tenant. Multiple Tenants multiply the variable costs; shared platform overhead is additional.

## Sensitivity and caching

With `n` replies, fixed input `F`, Contact tokens `u`, and reply tokens `a`, uncached input is `n*F + u*n*(n+1)/2 + a*n*(n-1)/2`; output is `n*a`. Unbounded history grows quadratically across calls.

| Change from baseline | Input / output tokens | Haiku/Luna USD | Sonnet USD |
| --- | --- | ---: | ---: |
| Retrieval rises from 1,500 to 4,000 each call | 66,600 / 1,600 | $0.00746 | $0.1492 |
| 20 Contact messages + 20 replies, full history | 107,200 / 3,200 | $0.01232 | $0.2464 |
| Add 1,000 billed reasoning tokens per call | 41,600 / 11,600 | $0.00996 | $0.1992 |

The 20-reply example remains below 100k **per request**, despite exceeding 100k aggregated input. Price thresholds apply per request. A 10% increase in identically distributed paid attempts increases expected spend about 10%; fallback or tool loops must use their actual sizes and rates.

Example tool sensitivity: adding two extra inference requests of 4,500 input and 200 output tokens each adds 9,000 input + 400 output, or $0.00110 on Haiku/Luna and $0.022 on Sonnet. If their tool results remain in later history, add those replayed tokens too. Tool execution service fees are separate.

Cache illustration: preserve only the 1,500-token system/schema prefix; leave retrieval and history uncached. One initial write, nine full hits, no eviction yields 26,600 ordinary input + 1,500 written + 13,500 read + 1,600 output tokens. At five-minute Claude rates this costs **$0.0037825 Haiku** or **$0.0743 Sonnet** (roughly 24%/25% below baseline). Luna has the same arithmetic at the listed write/read rates, conditional on a qualifying cached prefix. This is a favorable scenario, not a budget guarantee.

Claude Haiku/Sonnet 5.5 require at least 512 cacheable tokens; default cache lifetime is five minutes and a one-hour option costs more. OpenAI GPT-5.6 and later require at least 1,024 cacheable tokens and support explicit/implicit cache handling. Preserve exact prefix bytes/order and check billed usage. [Claude caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [OpenAI caching](https://developers.openai.com/api/docs/guides/prompt-caching).

Gemini implicitly caches qualifying repeated prefixes. Its current generic minimum table omits Flash-Lite, so this research does not assert its exact hit threshold. Explicit storage can dominate tiny savings: keeping 1,500 tokens for a full 720-hour month at $1/million/hour would cost $1.08 per cache object, before inference. Use short-lived caching only after measuring reuse. [Gemini caching](https://ai.google.dev/gemini-api/docs/caching), [Gemini storage price](https://ai.google.dev/gemini-api/docs/pricing).

Excluded from every table: embeddings and indexing, database/vector retrieval, hosting/queues, observability, Meta/BSP fees, payment charges, support, FX/taxes and refunds. Convert with the actual effective USD/BRL rate and payment costs; no exchange-rate forecast is implied. Budget uncached usage initially and meter input, output/reasoning, cache writes/hits, tools, retries and fallback per Tenant.

## pt-BR, tools and latency: what is known

The research found no primary-source, directly comparable benchmark of these exact models for Brazilian small-business WhatsApp knowledge answers, lead capture and Handoff. General reasoning/coding scores do not establish pt-BR suitability. No model was tested here; no ranking of factuality, tone or latency is claimed.

Haiku is marketed for latency-sensitive support and Sonnet's launch reports faster output than its predecessor. Those vendor-relative claims are not a Brazilian end-to-end latency SLA. [Haiku announcement](https://www.anthropic.com/claude-haiku-5-5), [Sonnet announcement](https://www.anthropic.com/claude-sonnet-5-5).

GPT-6 Luna supports streaming, structured output and function calling; its documentation distinguishes Responses support from Chat Completions constraints when reasoning is enabled. Gemini 3.5 Flash-Lite lists function calling and structured output. DeepSeek lists tool calls. Availability of a tool interface does not establish correct arguments, Tenant isolation or authorization. [Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna), [Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [DeepSeek capabilities](https://api-docs.deepseek.com/quick_start/pricing/).

Before choosing: run the same anonymized pt-BR corpus (e.g. 50–100 cases) against the shortlist, with missing/contradictory knowledge, colloquial messages, prices/dates, prompt injection, personal information and Handoff. Human-score factual grounding, invented commitments, tone, schema validity and appropriate Handoff. Measure total billable cost, p50/p95 time to first token and complete reply from the intended hosting region, including retrieval/tools, under representative concurrency. Decide thresholds with Daniel and the selected niche; do not fabricate acceptance targets from provider marketing.

## Data-processing and LGPD considerations

These are procurement facts and unresolved design requirements, not a legal guarantee. Training exclusion, deletion and geographic storage are different controls.

| Service | Training / processing terms | Retention and geography |
| --- | --- | --- |
| Anthropic commercial API | Commercial input/output is not used for model training absent explicit permission; review its DPA. | API inputs/outputs normally deleted within 30 days; Files, agreed terms, policy enforcement and law create exceptions. US/global inference controls; workspace storage currently US. US-only inference adds 10%. |
| OpenAI API | No training by default; DPA available. | Abuse logs normally up to 30 days; Responses state has default retention unless configured otherwise. ZDR/MAM requires eligibility and has endpoint exceptions. Regional storage differs from regional inference; use eligible project/endpoints/models. |
| Paid Gemini Developer API | An active billing-linked project qualifies as paid; prompts/responses are not used to improve products and are covered by the linked processor DPA. Free/unpaid usage has different terms. | Abuse policy states 55-day prompt/context/output retention. Terms permit transient storage/caching wherever Google/agents have facilities. Grounding, Files and stateful APIs add their own retention. |
| DeepSeek direct API | Published general privacy policy permits model improvement/training; a negotiated API-specific no-training DPA was not verified. | General policy places processing/storage in China and gives purpose-dependent retention rather than a fixed short API window. No Brazil pinning or self-service ZDR was verified. |

Anthropic sources: [commercial training policy](https://privacy.claude.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training), [retention exceptions](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [DPA](https://www.anthropic.com/legal/data-processing-addendum), [residency](https://platform.claude.com/docs/en/manage-claude/data-residency).

OpenAI sources: [data controls and endpoint retention](https://developers.openai.com/api/docs/guides/your-data), [DPA](https://openai.com/policies/data-processing-addendum/). Setting `store:false` avoids optional response storage but does not itself remove abuse logs or all cache state; do not equate it with ZDR.

Google sources: [paid/unpaid terms and processor DPA link](https://ai.google.dev/gemini-api/terms), [55-day abuse monitoring policy](https://ai.google.dev/gemini-api/docs/usage-policies?hl=en), [ZDR limitations](https://ai.google.dev/gemini-api/docs/zdr). The latter directs workloads requiring guaranteed ZDR/enterprise processing agreements to Vertex AI. Vertex would need a separate regional, contractual and price check; its guarantees must not be imputed to the direct API.

DeepSeek source: [general privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html). This is an unresolved contract fit, not proof that every commercial arrangement has identical terms. Given tiny inference savings at best, it is a lower-priority candidate for Contact data until those terms are established.

No selected direct endpoint was verified to keep both all storage and inference in Brazil. Overseas processing does not automatically establish either LGPD compliance or noncompliance. ANPD regulates international transfers and contractual safeguards. [ANPD international-transfer guidance](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados), [Resolution 19](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024).

For the later privacy decision: establish Tenant/platform/provider processing roles, lawful basis and Contact notices; map subprocessors and international-transfer mechanism; verify the actual DPA incorporates the needed Brazilian safeguards; choose local and provider retention/deletion settings; minimize personal data sent to inference and logs. A generic DPA or European clauses alone are not evidence that this project's Brazilian transfer obligations have been satisfied. Niche-specific sensitive data and unsolicited Contact messages need their own analysis.

## What remains to decide

1. **Existing pricing decision:** choose a bounded included-usage unit, limits/overages and acceptable margin using uncached costs, history/tool caps and non-LLM costs. Distinct Conversation count alone is insufficient. This research unblocks that discussion.
2. **Provider selection after evaluation:** choose the acceptable pt-BR quality/latency/cost bar and contract fit; then select one default provider and whether a paid fallback is needed. Running the evaluation is future validation, not completed evidence.
3. **Existing capability/architecture decisions:** bound replayed history, retrieved content, reply length, reasoning and permitted tool iterations; these determine the actual cost distribution.
4. **Privacy fog on the map:** narrow retention, sensitive-data handling and transfer safeguards once the niche and processing flow are known. Keep this with the existing privacy area rather than prematurely treating an API vendor as an LGPD solution.

No code or permanent domain change is proposed by this research artifact.
