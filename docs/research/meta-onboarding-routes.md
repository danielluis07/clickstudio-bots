# Meta onboarding routes: Tech Provider versus BSP

Research for [Meta onboarding routes: Tech Provider vs BSP](https://github.com/danielluis07/clickstudio-bots/issues/17), within [Wayfinder: is ClickStudio Bots viable, and what must be decided before the spec?](https://github.com/danielluis07/clickstudio-bots/issues/16).

Research date: 2026-10-19. This is decision evidence, not a provider selection or implementation specification. Exact Meta destination rates belong to [WhatsApp per-message pricing and billing in Brazil](https://github.com/danielluis07/clickstudio-bots/issues/18).

## Findings that change the decision

**Tech Provider and BSP are not mutually exclusive.** ClickStudio Bots can become a Tech Provider and connect directly to Meta, or become a Tech Provider working with a Solution Partner (the current name commonly replacing BSP). Meta explicitly permits independent or joint solutions. Only Solution Partners can extend a Meta credit line. Becoming a Tech Partner is a later program upgrade, not the starting requirement. [Meta partner ecosystem](https://whatsappbusiness.com/partners/become-a-partner/)

**Buying a BSP does not generally remove ClickStudio Bots' approval work.** Twilio requires an ISV's approved Meta app, Partner Solution, and Embedded Signup integration. Infobip likewise requires Tech Provider enrollment for ISVs. 360dialog documents a limited initial allowance of three numbers before Tech Provider registration; this is a vendor-specific allowance, not a universal Meta exemption. [Twilio program overview](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program), [Infobip program](https://www.infobip.com/docs/whatsapp/tech-provider-program), [360dialog program](https://docs.360dialog.com/partner/get-started/tech-provider-program)

**Same-number Business app coexistence must be an explicit acceptance condition.** It is positively documented by 360dialog, Gupshup, and Infobip. It changes onboarding, webhook behavior, and migration options; ordinary API-number migration instructions cannot simply be assumed to apply. Details and evidence limits appear below.

## Evidence quality and date limits

Sources below are first-party pages owned by Meta or the provider being described. Their public text was retrieved or search-indexed during this session. A crawl date is not a policy effective date, a promise of feature availability for this specific Brazilian company, or a binding quote. No sales team was contacted and no real number was onboarded.

Meta's current [Tech Provider guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers) returned HTTP 429; its [direct customer onboarding guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider) was also unavailable. Their contents are therefore **not independently verified here**. The direct-route checklist below triangulates accessible official partner instructions and Meta's public ecosystem page. Exact dashboard ordering and eligibility require checking the authenticated app dashboard before implementation.

Meta's [official Postman Embedded Signup collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup) remains useful for the shape of asset registration and webhook subscription. However, it still references On-Premises and requests `business_management`, whereas current Twilio and Infobip guides request both WhatsApp permissions. Its credit-line walkthrough describes a Solution Partner topology; it is not evidence that every Tech Provider receives credit. Do not copy that older collection as a current direct-route recipe.

## Direct Meta route from the stated starting point

The existing verified Business Portfolio is a prerequisite already satisfied; it is not proof of App Review, Advanced Access, or Tech Provider Access Verification. These are separate gates. Current partner instructions explicitly request Advanced Access for `whatsapp_business_management` and `whatsapp_business_messaging`. [Twilio integration guide](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide)

The following is the work to budget, with direct-only details requiring confirmation where indicated:

1. Register the developer identity; create or inspect a business-associated Meta app with WhatsApp and the verified Business Portfolio. Configure app identity, support contacts, privacy policy, supported platform, and domains. Start the WhatsApp Tech Provider onboarding wizard and accept the applicable terms. For a direct integration, do not create a BSP Partner Solution merely because a vendor tutorial does so. [360dialog registration walkthrough](https://docs.360dialog.com/partner/get-started/quickstarts/register-as-a-meta-tech-provider)
2. Build a demonstrable integration before requesting review: message sending/receiving, account/template management, and secure webhooks. Prepare English reviewer instructions or captions for the pt-BR product, permission-specific recordings, usable reviewer access, and truthful data-handling disclosures. Request only required permissions. [Infobip setup guide](https://www.infobip.com/docs/whatsapp/tech-provider-program/setup-and-integration)
3. Submit App Review for Advanced Access to both WhatsApp permissions. A recording must demonstrate sending and receipt for messaging, and template creation for management. Complete Tech Provider Access Verification when offered. Twilio documents this after App Review; 360dialog says when prompted. Do not promise the exact order for every app dashboard. [Twilio integration guide](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide), [360dialog registration walkthrough](https://docs.360dialog.com/partner/get-started/quickstarts/register-as-a-meta-tech-provider)
4. Configure Facebook Login for Business / Embedded Signup, callback domains and configuration ID, then finish the server-side onboarding actions for each Tenant. Tenant authorization must result in the correct WABA/phone-number access, production credentials, phone registration where applicable, app subscription, and tested webhooks. A successful popup alone is not an operational Channel. Facebook Login for Business is the supported Embedded Signup login, distinct from an ordinary Facebook Login configuration. [Twilio FAQ](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq), [Meta API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup)
5. Confirm the direct billing setup, live/non-role authorization, and production messaging end to end. If preserving the phone app is required, use the specific coexistence onboarding flow from the beginning and validate that it is available to the approved app; do not first migrate the number into API-only use and assume conversion is reversible. Infobip explicitly warns that API-only numbers cannot simply be converted into coexistence. [Infobip coexistence](https://www.infobip.com/docs/whatsapp/manage-integration/coexistence)

The exact current token exchange, token lifecycle, direct payment-method screens, live-mode switch, and any app-specific security prerequisites were not verifiable against the blocked Meta pages. They are implementation checks, not reasons to infer that a verified portfolio is already launch-ready.

### What is possible before approval?

Development and review demonstrations can precede external launch. Infobip's unreviewed Embedded Signup integration is limited to test accounts; its test WABA must use a different Business Manager from the Tech Provider's, with the setup person administering both. Treat this as a documented partner testing path, not a general authorization to onboard paying unrelated Tenants. [Infobip setup guide](https://www.infobip.com/docs/whatsapp/tech-provider-program/setup-and-integration)

360dialog's three-number allowance is not the same as Meta's test-number recipient limit, business-initiated messaging limit, phone-number limit, or onboarding quota. Its quickstart also lists Tech Provider registration as a prerequisite, so obtain confirmation before relying on that allowance for a production pilot. [360dialog program](https://docs.360dialog.com/partner/get-started/tech-provider-program), [360dialog partner quickstart](https://docs.360dialog.com/partner/get-started/quickstarts/get-started-as-a-partner)

After verification, App Review, and Access Verification, Twilio documents an onboarding quota of 200 **new platform customers per rolling seven days**. This is not 200 messages or a permanent cap on Tenants. No universal numeric direct unreviewed allowance was independently verified. [Twilio FAQ](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq)

### Timeline: published guidance versus a commitment

| Stage | Evidence | Interpretation |
| --- | --- | --- |
| Meta business verification | Already satisfied by the stated starting point | Do not add another verification delay unless app ownership/entity details are wrong. |
| Access Verification | Twilio says typically five business days | Provider guidance, not a verified Meta contractual SLA. |
| App Review | 360dialog says typically 24–48 hours | Optimistic provider guidance; no verified direct Meta maximum. |
| BSP-specific solution acceptance | 360dialog says typically within 24 hours | Separate vendor step, not Meta App Review. |
| Meta app approval plus Twilio linking | Twilio says usually 3–4 weeks; technical work additional | A useful documented planning reference, not a direct-route SLA. |

Sources: [Twilio integration guide](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide), [360dialog registration walkthrough](https://docs.360dialog.com/partner/get-started/quickstarts/register-as-a-meta-tech-provider), [Twilio overview](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program).

Planning inference: a solo developer should budget development time plus several weeks for external gates, with time for rework, rather than sell a fixed launch date. There is no reliable single end-to-end duration or published guaranteed Meta SLA established by this research. Faster vendor claims and several-week guidance concern different stages and should not be combined into a guarantee.

## Billing ownership is a separate choice

Keep four roles distinct: owner of the Business Portfolio/WABA, party authorizing ClickStudio Bots, party Meta charges, and party invoicing the Tenant. A vendor's “direct paid” label does not necessarily mean Meta directly charges the Tenant.

| Arrangement | Money flow | Consequence |
| --- | --- | --- |
| Direct Tech Provider with Tenant-funded WABA | Tenant supplies payment method to Meta; ClickStudio Bots bills SaaS separately | Intended direct topology; no assumed ClickStudio Bots credit line. Exact authenticated setup remains to verify. |
| Solution Partner credit line, Tenant billed by provider | Meta → provider; provider → Tenant | Tenant can pay usage separately from ClickStudio Bots, while Meta still bills the provider. |
| Solution Partner credit line, platform pays provider | Meta → provider → ClickStudio Bots; ClickStudio Bots → Tenant | ClickStudio Bots carries usage funding, collection and reconciliation exposure. |

Meta explicitly restricts credit-line extension to Solution Partners. Its indexed legal terms distinguish non-invoiced funding instruments from invoiced customers and make Solution Partners liable for their business customers' fees; the legal URL redirected to a login gate on direct open, so inspect the actual current agreement before contracting. The first row is the expected topology consistent with those roles, not a promise that every payment method/currency is available in Brazil. [Meta ecosystem](https://whatsappbusiness.com/partners/become-a-partner/), [Meta Terms for WhatsApp Business](https://www.whatsapp.com/legal/meta-terms-whatsapp-business)

360dialog offers Direct-Paid (360dialog invoices each business) and Partner-Paid (consolidated invoices to the platform). Twilio explicitly says Meta bills Twilio and the ISV pays Meta pass-through plus Twilio fees; Meta does not directly bill the ISV in that program. [360dialog billing choices](https://docs.360dialog.com/partner/get-started/partner-api-integration), [Twilio FAQ](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq)

## Provider comparison

Prices are public list references observed during this session, not Brazilian tax-inclusive quotes. They exclude Meta destination rates, foreign-exchange effects, taxes, AI/inbox products, and negotiated agreements unless stated. Ask separately about failed messages, marketing API surcharges, minimums, support, and partner fees.

| Route | What the platform still does / provider contribution | Provider charge evidence | Coexistence evidence |
| --- | --- | --- | --- |
| Direct Meta | ClickStudio Bots owns approval, onboarding integration, token/webhook operations, API maintenance, and support coordination | No BSP surcharge; this does not mean zero operational cost | Direct implementation eligibility could not be verified against Meta's blocked guide; require app-dashboard confirmation. |
| 360dialog | Tech Provider registration still required for scale; provider Hub, integrated onboarding, API, billing, escalation | Regular channel €49 / US$59 monthly; Premium €99 / US$119; higher throughput €249 / US$299. Partner program fees separate. | Documented same-number app/API route. |
| Gupshup | Provider partner onboarding/API and event delivery; confirm current ISV enrollment and commercial program | Self-serve page lists US$0.001 for outgoing templates and incoming/outgoing session text; media row says free. Obtain partner terms rather than assuming self-serve applies. | Documented; special enablement parameter if signup option is absent. |
| Twilio | Own approved Meta app + Partner Solution + Embedded Signup; messaging through Twilio Senders/Messaging APIs and Tenant subaccounts | US$0.005 per inbound/outbound message plus Meta template charges; product-specific extras possible | Not positively verified. Current FAQ requires number not already registered; legacy help instructs deleting the app account. Obtain explicit confirmation, not an assumption of support or a universal incompatibility claim. |
| Infobip | Own Tech Provider registration/App Review; joint Partner Solution; Infobip manages messaging service, maintenance and support | Obtain written API/ISV quote separating provider processing from Meta fees. AgentOS suite price is a different product, not a raw API quote. | Explicit same-number app/API support in current documentation. |

Sources: [360dialog channel prices](https://docs.360dialog.com/docs/get-started/pricing), [360dialog partner prices](https://360dialog.com/br/pricing), [Gupshup self-serve pricing](https://www.gupshup.io/channels/self-serve/whatsapp/pricing), [Gupshup coexistence](https://partner-docs.gupshup.io/docs/co-existence-closed-beta-phase), [Twilio dedicated WhatsApp prices](https://www.twilio.com/en-us/whatsapp/pricing), [Twilio program](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program), [Twilio app help](https://help.twilio.com/articles/360058369073-Can-I-use-my-Twilio-number-with-the-official-WhatsApp-mobile-desktop-app-), [Infobip program](https://www.infobip.com/docs/whatsapp/tech-provider-program), [Infobip coexistence](https://www.infobip.com/docs/whatsapp/manage-integration/coexistence), [Infobip service description](https://www.infobip.com/policies/service-description).

360dialog advertises zero message markup, but its pricing documentation separately describes a 7% marketing-message surcharge for the standard endpoint rather than the Marketing Messages API. Do not equate zero provider markup with the absence of all routing-dependent price differences. Its partner page shows a Starter €250/month plus €49/channel headline while also listing five included channels: obtain the actual commercial definition before modeling cost. [360dialog channel prices](https://docs.360dialog.com/docs/get-started/pricing), [360dialog Brazilian partner page](https://360dialog.com/br/pricing)

Gupshup's page mixes older conversation-pricing language with an announcement that per-message pricing is live. Preserve the published surcharge reference as indicative and request a current dated schedule; it is not evidence of a current Meta conversation charge. Twilio's dedicated page labels its prices current as of August 2026. Generic provider overview pages can retain older pricing terminology. [Gupshup pricing](https://www.gupshup.io/channels/self-serve/whatsapp/pricing), [Twilio pricing](https://www.twilio.com/en-us/whatsapp/pricing)

Infobip's service-description page contains date-bounded sections, including a WhatsApp section applicable only through 2026-09-30. That expired section must not be used as the current 2026-10-19 tariff. A negotiated current API/ISV schedule is needed. [Infobip service description](https://www.infobip.com/policies/service-description)

### Brazilian candidates

Blip's own Blip Go page explicitly promotes official Meta coexistence, retaining the Business app, number and history. Zenvia's own Customer Cloud article describes same-number coexistence and estimates 5–10 business days for that implementation. These establish offerings in the local ecosystem, **not** availability of a raw API/reseller arrangement for ClickStudio Bots, a Brazil-specific SLA, or permission to white-label their own onboarding. [Blip Go](https://www.blip.ai/blip-go-parceria-sincomavi/), [Zenvia coexistence](https://zenvia.com/es/blog/coexistencia-whatsapp/)

For either candidate, request an ISV/embedded-signup proposal: own approved app versus their hosted flow, WABA ownership, API access, coexistence enablement, support language, BRL invoice/tax treatment, provider markup, minimum spend, data export, exit cooperation, and Meta partner status for the contracting entity. Public product pages do not settle those commercial questions. Do not substitute an unofficial WhatsApp Web/QR automation product for the official coexistence flow.

## Coexistence details that matter to this product

360dialog documents message echoes: API messages appear in the app, and app-originated messages generate `smb_message_echoes` webhooks. It warns that unsupported companion devices can leave gaps. App messages remain free under its documented setup; Cloud API messages follow platform pricing. Its standard WABA migration guide does not apply to coexistence. [360dialog coexistence](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence)

Provider prerequisites conflict: 360dialog says at least seven days of active Business app use; Gupshup says three months of active history. Record these as provider-specific checks; this research establishes no universal Meta minimum. Gupshup also excludes Nigeria/South Africa and documents contact/history/echo-related caveats. Its June 2026 changelog targeted a GA rollout; that target alone is not proof of a successful GA deployment for this Tenant. [360dialog onboarding](https://docs.360dialog.com/docs/hub/embedded-signup/coexistence-onboarding), [Gupshup coexistence](https://partner-docs.gupshup.io/docs/co-existence-closed-beta-phase), [Gupshup June update](https://partner-docs.gupshup.io/changelog/june-2026)

Infobip documents a 20-message/second coexistence limit, a dedicated one-number WABA, history transfer through webhooks, and companion-device relinking. Groups remain in the app without API synchronization; disappearing/view-once/live-location features change. Brazil is not among its two explicitly excluded countries, but eligibility of the actual number still needs testing. [Infobip coexistence](https://www.infobip.com/docs/whatsapp/manage-integration/coexistence)

Product inference: an app-originated Member reply must be handled as a possible Handoff signal, while outgoing API echoes must not re-trigger the Bot. History synchronization, event gaps, and the distinction between manual Member activity and automatic app greetings need a real-number acceptance test. Neither a provider sales promise nor an API send demo establishes correct Handoff behavior.

## Portability and lock-in

For ordinary API numbers, Twilio documents migration retaining the display name, quality rating, messaging tier, OBA status, and eligible templates through Meta's duplication mechanism. Preconditions include an active verified portfolio, approved source WABA, valid payment method, and disabling number 2FA, potentially requiring the source partner. This establishes a migration path, not zero downtime or export of inbox history, automation, credentials, provider IDs and billing records. [Twilio migration guide](https://www.twilio.com/docs/whatsapp/migrate-numbers-and-senders)

Both 360dialog and Gupshup explicitly say coexistence numbers cannot use ordinary between-WABA migration. No universal partner-to-direct coexistence exit procedure preserving all history and uninterrupted app use was verified. Do not tell a Tenant that retaining its phone number means provider switching is already solved. [360dialog coexistence](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence), [Gupshup coexistence](https://partner-docs.gupshup.io/docs/co-existence-closed-beta-phase)

Engineering inference: retain a provider-independent Conversation/message store, explicit external IDs, idempotent event handling, a narrow provider adapter, and Tenant ownership/admin access to its Meta assets. A vendor switch will still require replacing authentication, payload/status mappings, template identifiers, and signup/billing flows. Obtain written exit obligations covering credit-line detachment, 2FA, number release, exports, cancellation and assistance before signing.

## Ongoing obligations

Meta's messaging policy requires permission for business messaging, honoring opt-outs, approved templates outside the 24-hour service window, privacy/data-use compliance, and prompt clear escalation paths for automation. A BSP does not transfer those product responsibilities away from ClickStudio Bots or its Tenants. Policy breaches and poor quality can restrict messaging. [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)

Operational inference: maintain app/security/contact details, respond to Meta review/checkup requests, protect and revoke tokens appropriately, process disconnection/deletion, monitor webhook failures and account quality, reconcile usage, and update deprecated API versions. The exact applicable Data Use Checkup/Data Protection Assessment cadence could not be verified from current accessible WhatsApp developer documentation; do not invent a yearly deadline for this app. Both direct and joint arrangements must honor the actual terms accepted in the dashboard. [Meta partner ecosystem](https://whatsappbusiness.com/partners/become-a-partner/), [Infobip program terms context](https://www.infobip.com/policies/service-description)

## Decision handoff

This investigation does not choose the route. [Choose the Meta onboarding path](https://github.com/danielluis07/clickstudio-bots/issues/23) already owns direct versus joint-provider selection, billing and migration tradeoffs.

Inputs now available: own Tech Provider approval is normally required on both routes; BSP value is billing/infrastructure/support and onboarding assistance; coexistence narrows candidates and exit options; public prices are insufficient to predict all-in Brazilian ISV cost; no guaranteed approval timeline was established.

Before committing to a vendor, obtain a dated ISV proposal and prove one representative Brazilian Business app Channel end to end, including Member reply echoes, Bot pause/Handoff, history availability, billing party, and a documented exit. No additional route-selection or exact-Meta-rate research ticket is needed for facts already assigned to the existing decisions.

Potential newly sharp decision: **What should a Member reply from the WhatsApp Business app do to Bot control, and how is automation restored?** This concerns product semantics exposed by coexistence, separate from vendor selection; check existing Handoff decisions before opening another issue.
