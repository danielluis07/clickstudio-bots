# Meta AI policy and Meta Business Agent research

Research date: 2026-10-19. Context: [Meta AI-chatbot policy and Meta Business AI](https://github.com/danielluis07/clickstudio-bots/issues/19). Research artifact only; no implementation or legal approval.

## Finding

ClickStudio's intended Tenant-specific Bot is materially different from distributing an unrestricted personal AI assistant through WhatsApp. The historical terms explicitly allowed retaining an AI provider as a service provider. However, the currently linked legal document is inaccessible without Facebook login in this investigation; the January wording must not be presented as a certified October contract.

Meta's native business responder is already a direct substitute for simple FAQ/catalog automation. Its current name is **Meta Business Agent**. A paid ClickStudio product needs a validated reason to exist beyond basic answers, tone customization and Handoff. Native-app free usage and Platform/API usage are separate commercial products.

## Evidence and confidence

Only primary sources establish the findings below. Public announcements establish what Meta announced, not actual eligibility on a particular Brazilian Channel. No production account was used, no feature was enabled, and no price was purchased. Unavailable documents and missing facts are recorded explicitly.

### WhatsApp policy: historical rule and current verification boundary

CADE's official March opinion reproduces the AI-provider clause on PDF pages 3–4. It covers model developers and generative/general-purpose AI providers when AI is the primary rather than incidental functionality, with Meta determining classification. It explicitly permits hiring an AI provider as a third-party service provider. The quoted clause prohibits using Business Solution Data, including anonymized/aggregate/derived forms, to develop or improve AI models. It allows fine-tuning a model for the business's exclusive use if other models do not benefit. January 15, 2026 is the scheduled effective date described in that record. This is historical evidence; the English translation expressly says the Portuguese case record controls. [CADE opinion](https://cdn.cade.gov.br/portal-ingles/noticias/20260309_RV%20Whatsapp_Opinion%20%281%29.pdf).

Practical interpretation for planning: answering questions about one Tenant's products, opening hours, policies and order workflow fits the service-provider pattern; selling access to an unrestricted assistant is the risky primary-AI pattern. Calling the product a business Bot is insufficient if its actual behavior is unrestricted. This is a reasoned application of the historical clause, not Meta's approval of ClickStudio.

On the research date, both the [legacy Business Solution Terms](https://www.whatsapp.com/legal/business-solution-terms) and [current Meta Terms for WhatsApp Business Platform](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform) redirected to a Facebook login/temporary-block page. The exact currently accepted terms, present country exceptions, provider obligations, and whether the fine-tuning exception persists therefore remain **unverified**. Conflicting third-party descriptions were not used to resolve this gap.

### Brazil: competition proceedings are narrower than product approval

On January 12, 2026, CADE opened an inquiry and imposed interim relief suspending the new restrictive terms. This addresses competition between Meta and other AI providers; it does not approve every automated business use. [CADE January notice](https://www.gov.br/cade/pt-br/assuntos/noticias/cade-abre-inquerito-contra-meta-e-aplica-medida-preventiva-suspendendo-novos-termos-do-whatsapp-sobre-ia/).

On March 4, CADE's Tribunal unanimously maintained the preventive measure and rejected WhatsApp/Facebook Brasil's appeal. This is an interim competition intervention, not a final merits decision or a worldwide repeal. [CADE March notice](https://www.gov.br/cade/pt-br/assuntos/noticias/tribunal-do-cade-mantem-medida-preventiva-sobre-novos-termos-de-uso-do-whatsapp).

On April 23, CADE maintained the infringement finding and R$250,000 daily fine, saying restoration of the previous competitive situation required AI providers to operate without additional access charges. It considered later message charges a possible indirect reproduction of exclusion and said treating those providers as marketing messages changed access conditions. This does **not** establish that a Brazilian Bot has no ordinary messaging costs, that Meta Business Agent is free on the API, or that the fine remains enforceable today. Subsequent judicial orders and the latest administrative docket were not verified. Relevant cases: inquiry 08700.012397/2025-63 and appeal 08700.000534/2026-06. [CADE April notice](https://www.gov.br/cade/pt-br/assuntos/noticias/cade-mantem-multa-diaria-contra-meta-e-whatsapp-por-descumprimento-de-medida-preventiva/).

### Automation and Handoff obligations

The publicly accessible WhatsApp Business Messaging Policy is marked September 23, 2026. Platform automation is allowed within the 24-hour customer-service window, provided prompt, clear, direct escalation paths exist; the listed paths include in-chat human support, phone, email and web support. Outside the window, approved templates are required. The policy also requires permissions/notices and a published privacy policy, honoring opt-outs, and forbids sharing one Contact's chat information with another. Industry and sensitive-information restrictions apply. [Current Messaging Policy, sections 1–4](https://whatsappbusiness.com/policy/).

ClickStudio implications (design recommendations, not additional quoted requirements): scope the Bot to its Tenant; make Handoff visible; stop automatic replies while a Member owns the Conversation; enforce messaging windows server-side; preserve Tenant isolation; choose model contracts/settings that prevent shared-model training on Conversation data. Retrieval from a Tenant's approved knowledge source should be distinguished from model training. Do not assume anonymization alone creates permission. The historical exclusive-use fine-tuning allowance should not become an MVP dependency while the current contract remains unverified.

### Instagram equivalent

No primary source successfully retrieved in this investigation established a matching Instagram-wide AI-provider ban. This is **absence of verified evidence**, not permission or proof that no restriction exists. The WhatsApp contract and CADE case cannot simply be applied to Instagram.

The [Instagram Human Agent documentation](https://developers.facebook.com/docs/messenger-platform/instagram/features/human-agent) and [current Instagram Login Human Agent path](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/human-agent/) could not be retrieved. Exact present messaging windows, automation restrictions, tags and permissions require verification against the chosen Instagram API/login product before specification. Do not assume a human-support extension authorizes unattended Bot messages.

## Meta's own competing product

### Scope and availability

On June 3, 2026, Meta introduced Meta Business Agent, announced global expansion and Instagram expansion, and described business answers, catalog recommendations, appointment booking, incoming-lead qualification, sales and Member intervention. It separately announced an enterprise Agent Platform with integrations such as Shopify, Zendesk and Shopee and support for WhatsApp, Messenger and Instagram. Morning briefings began with selected businesses; broader operational research/calendar/competitive-intelligence features and business discovery were future-facing announcements. They are not all verified live capabilities. [Meta June announcement](https://about.fb.com/news/2026/06/meta-business-agent/).

The Portuguese announcement corroborates the Instagram expansion and describes activation and future paid subscriptions; a Brazilian-language news release alone does not establish universal Brazilian availability. [Meta Brazilian announcement](https://about.fb.com/br/news/2026/06/conversations-2026-apresentamos-o-meta-business-agent/).

The current WhatsApp product page says eligible businesses in selected markets and features may differ. It includes a Brazilian business testimonial, supporting actual Brazilian usage without proving every account is eligible. Setup: register a number in WhatsApp Business, open Tools → Meta Business Agent, authenticate/link if prompted, configure, test and activate. Knowledge sources include past chats, Facebook Page, website, catalog and price lists; documents/photos are advertised. Controls include tone, audience, active time and when a Member steps in. The page advertises multilingual support without enumerating supported languages or proving Brazilian-Portuguese quality. [WhatsApp Business Agent product page](https://whatsappbusiness.com/products/business-app-ai-agent/).

### Pricing: three things that must stay separate

| Product/charge | Verified finding | Not established here |
| --- | --- | --- |
| Native WhatsApp Business app / Meta One | Business Agent has an included free monthly allowance; extra responses come through Meta One. Subscription is per profile/phone number. Benefits vary by account, region and app. | Numeric free quota, exact Brazilian BRL plan price, exact per-tier allowances, Instagram billing equivalence. |
| Meta Business Agent Platform/API | Separate from the native-app subscription. | Current token rate, free windows, delivery charges, billing eligibility and payment setup. |
| General-purpose AI-provider access in Brazil | CADE contested extra access charges in April. | Current legally effective charge/exception and its technical classification. |

The first two rows' product distinction comes directly from the Meta One FAQ: native app plans do not change WhatsApp Business Platform functionality/pricing. The app stays free; optional subscriptions add benefits and eligible new subscribers may receive a seven-day trial. The page publishes no numeric plan price or allowance. The June statement that getting started was free should not be read as an unlimited-free October offer. [Meta One product FAQ](https://whatsappbusiness.com/products/business-app-meta-one/).

The [AI-provider pricing page](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers), [non-template/Agent pricing page](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages), and [Agent overview](https://developers.facebook.com/documentation/meta-business-agent/overview) returned inaccessible/429 responses. Exact current API rates are deliberately not inferred from secondary summaries; the separate pricing research should own that verification.

### Competitive implications

Meta also publishes a Brazilian Movida case study using Agent Platform with reservation, pricing, payment and biometric systems, including PIX. The claimed conversion improvement and automation rate are self-reported test results, explicitly not repeatable guarantees. This demonstrates that enterprise integration is part of Meta's competitive direction; it is not evidence that all app users get these integrations. [Movida case study](https://whatsappbusiness.com/resources/success-stories/movida/).

Inferences for product discovery:

- Basic FAQ answers, catalog/website knowledge, configurable tone, multilingual replies, Handoff and lead gathering are weak differentiators because Meta already advertises them.
- A paid product might earn its place through a specific Tenant workflow, reliable multi-Channel Member operations, demonstrable answer quality, auditability, controlled knowledge changes, implementation/support service, or economics. These are hypotheses to test with Tenants, not verified omissions in Meta's product.
- Do not position cross-channel support, booking or integrations as categorically absent from Meta: its own announcement includes them.
- Do not use regulated industries as an assumed competitive escape hatch: WhatsApp's underlying policy restrictions still apply, and Agent-specific industry eligibility was not verified.

## Newly sharp decision questions

1. Which specific Tenant workflow produces a result worth paying for when Meta's native app already answers basic business questions and supports Handoff?
2. What explicit business scope and out-of-scope behavior should every Bot enforce, and how will a Member detect violations?
3. Should initial Tenants use ClickStudio exclusively or coexist with Meta Business Agent? If coexistence is needed, who owns each Conversation and what stops duplicate replies? Protocol details still need primary API verification.
4. Which model-provider contract and retention/training settings satisfy the currently accepted Meta agreement and the Tenant's data obligations?
5. Is a controlled eligibility/price/quality walkthrough on representative Brazilian WhatsApp and Instagram business accounts necessary before settling competitive positioning? Record actual account offers, pt-BR answers, Handoff behavior and quotas rather than relying on regional announcements.

## Verification gates before implementation commitments

- Retrieve and review the exact Platform terms accepted by the intended integration, including current AI-provider classification, data use, exclusive-use fine-tuning and country exceptions.
- Check current CADE case records and any superseding court orders before making a Brazilian general-purpose AI-provider access or price claim.
- Retrieve the current Instagram messaging policy for the chosen login/API route; confirm automated response versus human-support permissions.
- Verify current Platform costs through the dedicated pricing research and actual native-app offers through an eligible Brazilian account.
- Treat missing facts as bounded launch/specification gates. They do not require reopening the verified conclusion that native business automation is already substantial competition.
