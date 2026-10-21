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
| Model + transcription cost per Tenant / 5,000 replies | <=R$20 | | |

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
| Authorized audio notes / audio seconds / billable seconds | | | |
| Transcription cost BRL / assumed voice share | | | |
| Audio end-answer correctness / human tone | | | |
| Combined cost at 5,000 replies BRL | | | |

Project model cost from the measured case mix, including retries and cache misses.
For the combined projection, record the assumed voice share and measured mean
transcription cost per voice reply: model projection + 5,000 × voice share × mean
transcription cost. If voice/text model costs differ, weight those separately.
Report model failures as incomplete cost evidence; zero tokens on failure is not
evidence of a free request. The text runner's `modelCost` gate excludes audio.

Record per-case human judgments in `reviews.json`, bound to this run id. Review
the delivered reply against the case's exact Knowledge base, behaviour and rubric.
Tone: 1 unusable, 2 major rewrite, 3 understandable but awkward, 4 natural with
minor edits, 5 natural and appropriate. Record any non-Brazilian or translated
phrasing separately. A keyword match alone cannot establish semantic grounding
or absence of invented commitments.

Record voice evidence with `voice-notes.template.json`. Keep it local until data
handling and authorization permit sharing. The 15 slots are pending until actual
authorized recordings have been evaluated through the production transcription
and Bot path; transcripts typed by an evaluator are not transcription evidence.

Decision, failed case ids, limitations, reviewer and rerun action:

_Pending. A passing text score alone does not establish the audio, provider terms,
hosting-region or combined-cost launch gates._
