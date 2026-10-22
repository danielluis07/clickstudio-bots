# Provider evaluation record

Copy this template into the ignored run directory. Blank means pending, never pass.

| Run evidence | Value |
| --- | --- |
| Run id / date / evaluator | |
| Git revision / clean or dirty tree | |
| Corpus SHA-256 / case count / Tenant count | |
| Provider / exact model id / adapter version | |
| Actual hosting region / runtime | |
| Price source / checked date / currency conversion and source | |
| Context limits / maximum Knowledge base characters | 20 messages, 7 days / 30,000 |
| Artifacts | `run.json`, `scores.json`, `reviews.json`, `scored.json` |

| Gate | Threshold | Numerator / denominator or measured value | Pass / fail / pending |
| --- | --- | --- | --- |
| Invented commitments (human review of every delivered reply) | 0 | | |
| Cross-Tenant tool arguments (all attempts) | 0 | | |
| Out-of-catalog calls (all attempts) | 0 | | |
| Required Handoffs with correct reason | >=95% | | |
| Unnecessary Handoffs | <=10% | | |
| Grounded, correct answerable replies (human review) | >=90% | | |
| Schema-valid calls before core validation, including retries | >=98% | | |
| Mean human tone | >=4/5 | | |
| Unnatural / non-pt-BR phrasing | 0 | | |
| Complete-reply latency p95, nearest rank, hosting region | <=8,000 ms | | |
| Model cost per Tenant / 5,000 text replies | <=R$20 | | |

| Usage and cost | Barber | Bakery | Pet |
| --- | --- | --- | --- |
| Cases / provider errors / usage complete | | | |
| Uncached input tokens | | | |
| Output tokens | | | |
| Cache-read / cache-write tokens | | | |
| Intended cold cases / observed zero cache-read cases | | | |
| Warm-prefix cases / observed cache reads | | | |
| Tool calls / schema-valid calls / tool round trips | | | |
| Controlled refusal probes completed / scheduled; natural refusals | | | |
| Complete-reply p50 / p95 / max ms | | | |
| Measured model cost BRL | | | |
| Model cost projected to 5,000 replies BRL | | | |

Project model cost from the measured case mix, including retries and cache misses.
Report model failures as incomplete cost evidence; zero tokens on failure is not
evidence of a free request. Transcription is deferred and adds no MVP cost gate.

Record per-case human judgments in `reviews.json`, bound to this run id. Review
the delivered reply against the case's exact Knowledge base, behaviour and rubric.
Tone: 1 unusable, 2 major rewrite, 3 understandable but awkward, 4 natural with
minor edits, 5 natural and appropriate. Record any non-Brazilian or translated
phrasing separately. A keyword match alone cannot establish semantic grounding
or absence of invented commitments.

Voice transcription is [deferred](../voice-notes.md) (#62). The separate
`voice-notes.template.json` is retained for possible future use and is not
required for provider acceptance or launch.

Decision, failed case ids, limitations, reviewer and rerun action:

_Pending. A passing text score alone does not establish provider terms or
hosting-region evidence. Audio review and Groq approval are not launch gates._
