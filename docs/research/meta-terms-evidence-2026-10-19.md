# Meta terms and Instagram automation rules: evidence (issue #30)

Retrieved 2026-10-19 through Chrome (pt-BR and en_US locales). No credentials were used or recorded. Paraphrased, not a verbatim copy; the source URLs are authoritative. This is evidence, not legal advice and not Meta approval.

## 1. WhatsApp Business Platform

| Document | Source URL | Last updated (displayed) | Applies to |
| --- | --- | --- | --- |
| Meta Terms for WhatsApp Business Platform | https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform (`?locale=en_US`) | 23 Sep 2026 | All WhatsApp Business Platform use (direct customers, Clients, Solution Providers); worldwide |
| Country-Specific Non-Ads Terms (target of the "here" link in 4.7) | https://www.facebook.com/legal/country-specific-non-ads-terms | 1 Jul 2026 | Brazil and India contracting-entity provisions |
| New pricing policy for AI Providers using the WhatsApp Business Platform | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers | 15 Oct 2026 | AI Providers; lists Brazil (+55) |
| WhatsApp Business Messaging Policy | https://business.whatsapp.com/policy | 23 Sep 2026 | All businesses |

### Findings from the Terms (English version governs, section 7.2)

- **4.7 AI Providers.** Providers/developers of AI or ML technologies (LLMs, generative AI platforms, general-purpose assistants, "or similar technologies as determined by Meta in its sole discretion") are prohibited from using the Platform, directly or indirectly, to make such technology available when it is the *primary* (not incidental or ancillary) functionality, as Meta determines in its sole discretion. Exception: such technologies "may be made available to businesses in certain countries as set forth here".
- **4.7, Solution Provider carve-out.** A business may retain an AI Provider as its Solution Provider. Then the business may not directly or indirectly allow Platform Data (including anonymous, aggregate or derived forms) to be used to create, develop, train or improve any AI Models.
- **4.7, exclusive-use fine-tuning.** Platform Data may be used to fine-tune an AI Model for the business's exclusive use, provided this does not result in the data being used to create, develop, train or improve any other AI Model.
- **4.1(a)-(b).** Apart from message-thread content, Platform Data may not be used to track, build or augment profiles of individual WhatsApp Users. Platform Data, including anonymous, aggregate or derived forms, may not be shared with third parties except a Solution Provider.
- **1.3.** Business Agents are governed by separate "Meta Business Agents and Platform Terms of Service" (https://www.facebook.com/legal/3774714022740775). Not captured here; other AI-related technologies may carry additional terms.
- **1.4.** Meta acts as Processor under the Meta Global Processor Terms, and independent Controller under the Meta DPA. Linked, not captured.
- Whether ClickStudio is an "AI Provider", and whether its AI is "primary functionality" or "incidental/ancillary", is decided by Meta in its sole discretion. The Terms give no objective test.
- "Tenant-specific service provider" is not a term used by the Terms. The relevant concepts are Client and Solution Provider (1.1, 4.1(b), 4.7). Mapping ClickStudio's Tenants to those roles is an open interpretation question.

### Finding on the "Brazil exceptions"

- The "here" link in 4.7 goes to the Country-Specific Non-Ads Terms page. That page has no AI-provider exception; its Brazil section covers only the contracting entity (Facebook Serviços Online do Brasil Ltda.), BRL invoicing, taxes and late-payment terms for Brazilian companies billed in BRL. **No AI exception clause was found in the Terms or the page they link.**
- The AI-provider pricing page says the Terms require AI Providers to offer only general-purpose AI assistants where Meta is "legally required" to allow it. It lists Brazil (+55) as a market where AI Providers may send service messages, charged at published rates, effective 11 Mar 2026. It also lists the EEA markets plus Italy and Turkey. In the EEA and Italy, charging stopped on 13 May 2026. In Turkey, charging is suspended until 11 Apr 2027. The page does not say this is a court-ordered or CADE-ordered exception. It says the 24-hour service window is unchanged.
- The pricing page's rate card (CSV/PDF) and pricing analytics category `AI_BOT` / webhook category `general_purpose_ai` were noted but not captured.

### Findings from the Messaging Policy

- Service messages are sent inside the 24-hour window; outside it only approved templates.
- Automation is allowed in the 24-hour window, but a prompt, clear and direct escalation path must be available: in-chat human agent transfer, phone, email, web support, in-store visit or support form.
- Data obtained from WhatsApp about a person (other than message content) may be used only as reasonably necessary to support messaging with that person.

## 2. Instagram messaging

### Route A: Instagram API with Instagram Login (retrieved)

Source: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api ("Send messages", updated 28 Sep 2026, pt-BR). Applies to Instagram professional accounts via `graph.instagram.com`.

- Conversations can start only when an Instagram user messages the business. The app may then send inside the standard messaging window: 24 hours for most user actions, up to 7 days from the first message after a click-to-Direct ad.
- Human-agent experiences: if a person is replying, the app may flag the reply to use a separate 7-day window.
- Automated experiences: an escalation path must be offered, either a custom inbox (single app) or the Handover Protocol (multiple apps), to hand off to a human agent.
- Disclosure: where required by applicable law, automated chats must disclose that the user is talking to an automated service at the start, after a significant time lapse and when switching from human to automation. Special attention for California and Germany markets. Disclosure is otherwise recommended. Brazil is not named.
- Permissions: `instagram_business_basic`, `instagram_business_manage_messages`. Advanced Access if serving accounts the app owner doesn't own or manage. Webhooks: `messages`, `messaging_optins`, `messaging_postbacks`, `messaging_reactions`, `messaging_referrals`, `messaging_seen`.
- Limits: no group messages, text up to 1,000 bytes, requests-folder messages inactive for 30 days are not returned by the API.
- The dedicated Human Agent page (`.../messaging-api/human-agent/`) renders with no content even when signed in (en_US and pt-BR). It is absent from the current navigation, and its content appears folded into the page above. This is a finding, not an error on our side.

### Route B: Instagram API with Facebook Login / Messenger Platform (NOT retrieved)

- `https://developers.facebook.com/docs/messenger-platform/instagram/features/human-agent` and `.../documentation/messenger-platform/instagram` return "page not found" (removed). `.../instagram-api-with-facebook-login/messaging-api` renders empty.
- The current Messenger-Platform/Facebook-Login Instagram messaging documentation was not located. Third-party sources (Chatwoot, Sinch, Woztell) describe a `HUMAN_AGENT` tag giving a 7-day window for manual human replies only. These are unofficial and not relied on.
- **Needs Daniel:** locate the current official Route B documents, or confirm Route A is the chosen route.

## 3. Brazil: CADE case

Official CADE records (SEI / process search) were **not** retrieved. Secondary press and law-firm reports only:

- Jan 2026: CADE Superintendence-General opened an administrative inquiry (Meta/WhatsApp Business, AI chatbots) and adopted a preventive measure. A federal court in Brasília briefly suspended it.
- 4 Mar 2026: CADE tribunal unanimously rejected Meta's appeal; the preventive measure stands, suspending application of the new WhatsApp terms to AI in Brazil pending the final decision.
- 23 Apr 2026: tribunal confirmed non-compliance (focus: reclassifying AI chatbot messages and per-message charging), kept a R$ 250,000 daily fine, referred to judicial enforcement.
- Latest report found: 7 May 2026 (Lefosse). Nothing newer found. The inquiry has no final decision as far as found.
- Process numbers `08700.012397/2025-63` and `08700.000534/2026-06` were not found in results; this is not confirmation or denial.
- Sources: https://www.cnnbrasil.com.br/economia/negocios/cade-mantem-medida-preventiva-que-obriga-meta-a-permitir-chatbots-de-ia-no-whatsapp/ , https://mercadoeconsumo.com.br/23/04/2026/noticias/cade-mantem-multa-diaria-contra-a-meta-no-caso-envolvendo-uso-de-chatbots-de-ia-no-whatsapp/ , https://lefosse.com/newsletter/cade-confirma-descumprimento-de-medida-preventiva-no-caso-whatsapp-business-e-mantem-multa-diaria-de-r-250-mil/

Planning implication: Meta's own pricing page lists Brazil as an allowed market for AI Providers, but states no legal basis. Until official CADE records are checked, planning should not depend on a Brazil-specific exception or on its stability. Daniel decides whether to adopt that assumption.

## Planning assumptions confirmed by Daniel (2026-10-19)

- **Instagram route:** Instagram API with Instagram Login (Route A). Route B (Facebook Login / Messenger Platform) is out of scope; its documents were not retrieved and are not needed.
- **Brazil exception:** planning does NOT rely on any Brazil-specific general-purpose-AI or access-fee exception. Official CADE records are therefore not required.

## 4. Remaining interpretation questions

1. Does Meta consider ClickStudio an "AI Provider" (4.7), and is the Bot primary or incidental functionality? Meta decides in its sole discretion.
2. Which role does each Tenant and ClickStudio hold: Client, Solution Provider, or AI Provider acting as Solution Provider?
3. Does "derived forms of Platform Data" (4.7) cover Bot prompts, summaries or embeddings built from conversations? The exclusive-use fine-tuning carve-out is per business; does one fine-tune per Tenant satisfy "exclusive use"?
4. Meta Business Agents terms and the Meta Global Processor Terms were not reviewed.
5. Route B documents: closed, Route A chosen.
6. Official CADE status: closed, Brazil exception excluded from planning.
7. Why the Terms' "here" link for country exceptions points to a page without one; ask Meta support or an advisor.
