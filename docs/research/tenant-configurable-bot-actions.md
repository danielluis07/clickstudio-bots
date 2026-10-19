# Feasibility of Tenant-configurable Bot actions

Research date: 2026-10-19. All external sources below accessed on that date. This is planning evidence for [Feasibility of Tenant-configurable Bot actions](https://github.com/danielluis07/clickstudio-bots/issues/22), under [Wayfinder: is ClickStudio Bots viable, and what must be decided before the spec?](https://github.com/danielluis07/clickstudio-bots/issues/16). Recommendations and effort ranges are engineering judgments, not vendor claims or a locked product decision.

## Answer

Feasible for one developer if “configurable” means a small catalog of supported actions with constrained forms and Tenant-specific connections. A general automation builder with arbitrary HTTP, many native integrations, and bring-your-own MCP servers is a different product and a poor default for first paying Tenants within approximately three months.

Recommend answer-from-knowledge-base, Contact information capture and Handoff as the baseline. Add one fixed action only if the chosen niche requires it to buy. For appointment businesses, distinguish an appointment request requiring a Member's response from an appointment confirmed against an authoritative scheduling system. Do not sell the former as autonomous booking. If confirmed booking is the core proposition, fund a narrow scheduling integration and reduce other MVP scope; capture alone may fail the commercial requirement.

This recommendation remains conditional on the target niche and go/no-go. [Choose the Bot capability model](https://github.com/danielluis07/clickstudio-bots/issues/28) already holds the product decision; this report does not resolve it.

## Patterns and their real boundaries

| Pattern | What a Member configures | Suitable first scope | Main cost driver |
| --- | --- | --- | --- |
| Built-in catalog | Enable an action; permitted fields, destination, constraints | Capture Contact details, create request, Handoff | Shared execution safeguards and one clear contract per action |
| Outbound event webhook | Destination and secret, preferably provisioned by Daniel initially | Deliver a captured request to a Tenant's Make/n8n/Zapier automation | Delivery reliability and support across the boundary |
| Generic HTTP tool | Method, URL, auth, request/response mappings, tool description | Technical Tenants or agency-assisted setup after demand | SSRF, credentials, schema changes, validation, debugging arbitrary APIs |
| Native integration | Connect provider, choose resource and action, map limited fields | One CRM, Sheets append, or one scheduling provider | OAuth lifecycle, provider-specific semantics and support |
| MCP client | Connect approved server, authenticate, enable an approved subset of tools | Later implementation option behind the same catalog | Trust, changing tool definitions, authorization, compatibility and external support |

Catalog and native integration are complementary: a Tenant can enable a platform-owned “create appointment request” action whose implementation uses a supported integration. The LLM proposes structured arguments; platform code decides whether execution is allowed. The platform owns action definitions, validation and destinations. Tenant configuration should not become Tenant-authored code.

An outbound event notification and a synchronous HTTP action are different promises. A durably recorded request can be acknowledged before its webhook delivery succeeds, provided the Contact hears that the request was received rather than that an external booking succeeded. A lookup or confirmed write requires a verified result from the authoritative system. An HTTP 200 is insufficient if the provider encodes business failure in its response.

## Competitor evidence and SMB UX implications

These are documented setup flows, not hands-on usability testing or proof that an inexperienced Brazilian SMB owner can complete setup unaided. The inference is that native selection and field mapping reduce technical concepts; raw requests still expose them.

| Product | Documented behavior | Implication for ClickStudio Bots |
| --- | --- | --- |
| Manychat | Sheets connects through settings, then a wizard selects spreadsheet/worksheet and maps fields. It supports insert, lookup and update; changed worksheet structure requires refreshing fields. [Official Sheets guide](https://help.manychat.com/hc/en-us/articles/14281248811292-Google-Sheets-integration) | Copy connect → choose destination → map a small field set → test. Even a spreadsheet connector creates ongoing schema support. |
| Manychat | External Request exposes HTTP methods, HTTPS URL, headers, JSON body, test request and JSONPath response mapping. It is available on certain paid plans. [Official External Request guide](https://help.manychat.com/hc/en-us/articles/14281285374364-Dev-Tools-External-request) | This is a technical escape hatch, not evidence that arbitrary integration setup is simple for a nontechnical Member. |
| Botpress | Actions are reusable custom code beyond default cards/integrations; Execute Code supports JavaScript/API calls. Its documentation advises reviewing generated code, using configuration variables for secrets and handling failures/timeouts. [Actions](https://botpress.com/docs/studio/concepts/actions/), [Execute Code](https://botpress.com/docs/learn/reference/cards/execute/) | A capable builder may shift development to the Tenant or implementer. Do not mistake that for eliminating maintenance. |
| Voiceflow | Native tools authenticate through OAuth or credentials, then enable selected actions. Tools can be called autonomously in a playbook or at an explicitly mapped workflow step. Examples include Sheets, HubSpot and Salesforce. [Agent tools](https://www.voiceflow.com/docs/documentation/build/tools/overview) | Separate “what may be done” from “when it runs.” A fixed process can be more predictable than autonomous selection for a narrow business operation. |
| Intercom | Data connectors fetch or update external data; Fin can invoke them directly or through conditional workflows/procedures. Its API guidance addresses identity verification and risk assessment for sensitive data or mutations. [FAQs](https://www.intercom.com/help/en/articles/9916507-data-connectors-faqs), [API design guidance](https://www.intercom.com/help/en/articles/10576235-designing-and-using-your-apis-with-data-connectors) | Personalized lookup and writes need verified identity and policy gates, beyond configuring a friendly tool name. |

Suggested Member experience: choose a concrete outcome, connect the supported system, select the allowed resource, review fields and approval behavior, run a safe test, then enable. Use pt-BR interface copy and distinguish pending requests, confirmed external success, failures and uncertain outcomes. Keep credentials and API payload editing in an assisted technical setup if offered at all. A toggle should show prerequisites and fail closed when the connection expires.

The surveyed documentation does not establish a universal competitor confirmation policy. HTTPS restrictions, test buttons, workflows and field mapping are useful controls, but are not proof of authorization, idempotency or Contact confirmation on every write.

## Native integrations: deceptively different scopes

**Sheets:** Start with append-only captured requests into a chosen spreadsheet. Avoid arbitrary range access and record updates initially. Google's scope guidance recommends `drive.file` for access to specific files used with the app; broad spreadsheet scopes are sensitive, while scope access cannot be limited to one worksheet. Scope choice affects verification requirements. [Google scopes](https://developers.google.com/workspace/sheets/api/scopes). API quotas require throttling/backoff; they are separate from any intermediary's quotas. [Google usage limits](https://developers.google.com/workspace/sheets/api/limits). A row append is not a booking reservation or a CRM uniqueness guarantee. Prefer plain values to interpreting Contact-controlled text as formulas; persist an operation identifier for reconciliation.

**Calendar:** Google exposes busy intervals through `freebusy.query` and event creation separately. Event creation supports client-supplied event IDs to prevent duplicates after an ambiguous successful request. [Free/busy reference](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [Create events](https://developers.google.com/workspace/calendar/api/guides/create-events). Engineering inference: checking availability and then inserting an event does not establish an atomic slot reservation. A reliable product must define business hours, service duration, buffers, time zones, staff/resources, cancellations and who else can write the calendar. Serialize competing platform operations and reconcile ambiguous writes; external writers still require an explicit conflict policy. Prefer the niche's existing booking system when it provides authoritative reservation semantics.

**CRM:** “CRM integration” is not a single action. HubSpot's Contacts API distinguishes object creation, lookup and update and supports properties and associations. [HubSpot Contacts guide](https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide). Judgment: begin with one provider and one operation, such as create/update Contact after explicit field mapping and a defined deduplication key. Do not imply matching an incoming phone number proves ownership of an existing CRM record or authorizes returning private information. Deals, pipelines, custom properties and different CRMs each enlarge the supported contract.

**MCP:** The current tools specification supplies discovery, tool calls, input/output schemas and guidance for visible tools and human confirmation. It requires validation, access control, rate limits and output sanitization; tool annotations from untrusted servers are untrusted. [MCP tools, revision 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools). Security guidance covers authorization threats, including token passthrough and confused-deputy risks. [MCP security](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices). Judgment: MCP can standardize an adapter interface, but does not supply ClickStudio's Tenant isolation, business policies, provider credentials or reliable booking. Use approved remote servers/tools only if a real integration need justifies the extra layer. Do not run Tenant-supplied local MCP processes on shared infrastructure.

## Minimum execution contract

The following is a proposed design checklist for future implementation, not a claim that code already exists or a demand to implement it during wayfinding.

1. **Trusted context:** Derive Tenant, Channel, Conversation and Contact from authenticated server context. Never accept an LLM-selected Tenant ID or credential ID as authority. Resolve connected resources only inside that Tenant; enforce Member permissions when configuring and approving actions.
2. **Explicit capability:** Version a platform-owned action definition: typed input/output schemas, enabled Tenant configuration, resource allowlist, timeout, permissions, effect classification and confirmation policy. Revalidate on the server immediately before execution. Schemas do not prove that a requested date, record or resource is allowed.
3. **Bounded loops and spending:** Cap calls per Bot turn/Conversation, payload and output sizes, execution time, retries, concurrent jobs and per-Tenant daily usage. Start with illustrative limits such as three tool calls per turn, a short provider timeout and bounded retry attempts; tune from measured provider behavior. Queue fairness prevents one Tenant exhausting shared provider quotas. These numbers are proposed defaults, not researched optimal limits.
4. **Durable operation state:** Record proposed, awaiting confirmation, executing, succeeded, failed or uncertain. Deduplicate inbound message deliveries and maintain an operation key across retries. Retry read operations and known-safe/idempotent writes only; reconcile uncertain non-idempotent writes before another attempt. Return verified provider IDs and safe result fields. Never let generated prose stand in for a successful write.
5. **Separate confirmations:** Contact confirmation checks the intended date/service/data. Member approval handles business authority or risky changes. An approval must bind exact arguments, Tenant and version, expire, and be invalidated after edits. Money movement, deletion and destructive changes stay outside the proposed MVP. A prompt saying “ask first” is insufficient enforcement.
6. **Connection lifecycle and observability:** Encrypt Tenant credentials at rest, keep them out of prompts and logs, use minimal scopes, implement disconnect/revocation and reconnect states, and record redacted attempts, latency and provider IDs. Give Members a comprehensible failure/Handoff path and Daniel a diagnostic view. Stop Bot actions during Handoff according to an explicit policy.
7. **Treat external data as data:** A tool response, document or Contact message cannot change action permissions. Allow only selected output fields into model context and avoid disclosing raw provider errors, internal network details or unrelated records.

For Tenant-configured outbound destinations, protect against SSRF at delivery time, including DNS resolution/private addresses and redirects; HTTPS alone is insufficient. Sign event deliveries, rotate secrets, deduplicate events, bound retries, use a queue/dead-letter path and redact sensitive payloads. These control categories follow [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) and [OWASP Webhook Security](https://cheatsheetseries.owasp.org/cheatsheets/Webhook_Security_Cheat_Sheet.html). A fixed, vetted endpoint list is a cheaper first scope than arbitrary destinations.

Meaningful future tests should cover cross-Tenant credential/resource access, repeated message delivery, double confirmation, changed arguments after approval, timeout after provider success, expired OAuth, quota exhaustion, malicious tool output and booking conflicts. Those tests protect boundaries rather than merely repeat implementation logic.

## Solo developer effort and recurring maintenance

These are rough planning judgments, not sourced benchmarks, quotes or guarantees. One focused developer-day means approximately six productive engineering hours. Assume an existing authenticated dashboard, working Channel ingestion, Bot loop, Tenant-scoped persistence and Handoff. The repository currently has application dependencies but this research has not audited those capabilities as complete. Building missing baseline infrastructure is additional. Ranges include focused tests, error states and basic operational visibility; exclude vendor approval waiting, sales, legal work, broad workflow builders and unusual migrations.

| Increment | Initial focused days | Recurring engineering/support budget per month at roughly 10–30 Tenants | Scope of estimate |
| --- | --- | --- | --- |
| Shared action executor | 5–10 | 0.5–1 day | Schema validation, Tenant permissions, operation state, deduplication, quotas, logs |
| Small internal catalog | +2–5 | +0.5–1 day | Two or three capture/request/Handoff capabilities and constrained settings |
| Managed outbound webhook | +3–6 | +0.5–2 days | One event schema, vetted destinations, signatures, queue/retry and delivery diagnostics |
| Self-service generic HTTP | +10–20 | +2–5 days | Auth storage, URL security, schema/mapping editor, test tooling and arbitrary endpoint failures |
| One Sheets append connector | +4–8 | +0.5–2 days | OAuth, selected file/worksheet, small fixed mapping, expired connection handling |
| One narrow CRM connector | +6–12 | +1–3 days | One provider, one object/operation, mapping, deduplication and provider errors |
| Narrow confirmed-booking connector | +10–20 | +1–3 days | One provider, simple service/staff policy, confirmation, conflict and uncertain-result handling |
| Approved remote MCP support | +8–15 | +1–3 days | One trusted server, auth/discovery, tool selection/version policy and executor adapter |

Add the shared executor once. Connector ranges are incremental; do not add every row for a narrow MVP. Some work can be reused across Google connectors, but Sheets and Calendar business semantics remain separate. Broad scheduling with multiple staff/resources, cancellation/rescheduling and external calendar writers can exceed the booking range materially. Arbitrary Tenant MCP servers can exceed the MCP range and should be re-estimated as a separate platform commitment.

Maintenance is bursty and can exceed these allowances during provider deprecation, OAuth changes or outages. Onboarding needs an additional estimated 0.5–2 hours per Tenant for a fixed native connector and 2–8 hours for custom HTTP; bespoke mappings can take longer. Agency-assisted integrations consume Daniel's delivery time even when an automation vendor supplies the connector. External automation subscriptions, provider fees, hosting/queue/log storage, credential management and LLM tool turns remain recurring monetary costs; no precise BRL estimate is justified without chosen providers and traffic.

At a side-product allocation of 15 productive hours per week, even 10–20 developer-days represent about four to eight weeks. This conversion is an assumption for planning, not Daniel's confirmed schedule. It makes broad configurability a significant risk to the three-month commercial target.

## Proposed MVP cut and remaining decisions

For a niche buying inquiry handling and lead qualification: a Tenant chooses required Contact fields, enables request capture and Handoff, and reviews requests in the dashboard. No arbitrary URLs, custom code, generic MCP setup or multi-provider catalog. Offer an existing scheduling link when appropriate, or record a clearly pending appointment request. Add append-only Sheets or a managed outbound event only when a pilot demonstrates that a dashboard request cannot fit the Tenant's workflow.

For a niche buying verified appointments or live order status: validate the incumbent system and its API before promising the outcome. Choose one authoritative provider and operation, implement Contact identity checks where private data is involved, and narrow the rest of the product. An integration lacking a usable authoritative API may rule out that niche for this MVP; “we can probably connect it later” is not feasibility evidence.

The next decision remains [Choose the Bot capability model](https://github.com/danielluis07/clickstudio-bots/issues/28), after [Choose the target niche and positioning](https://github.com/danielluis07/clickstudio-bots/issues/24) and [Go/no-go](https://github.com/danielluis07/clickstudio-bots/issues/27). It should record the purchased outcome, first action, authoritative system, setup owner and failure/confirmation promise. Those are facets of the existing decision rather than new independent tickets today. Architecture and MVP-cut fog can graduate once this choice is made.

## Uncertainties and limits

- No pilot interviews or observed SMB onboarding sessions were conducted. Competitor documentation demonstrates features, not willingness to pay or ease of use.
- No specific Brazilian niche, CRM or booking provider is chosen. Feasibility of a given provider's commercial API access, OAuth approval, sandbox and reservation guarantees remains unverified.
- This report does not resolve Meta policy eligibility, messaging charges, LGPD retention/consent or the broader commercial go/no-go; those belong to their map areas.
- No implementation was changed or tested. The untracked root glossary was read for vocabulary and is not included in this research branch. No ADR files were present to conflict with the recommendations.
- MCP references are pinned to the current 2026-07-28 revision; provider documentation is mutable. Recheck the selected integration before implementation.
