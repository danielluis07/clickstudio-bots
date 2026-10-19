# WhatsApp Brazil pricing and billing

Research date: October 19, 2026. Question: [WhatsApp per-message pricing and billing in Brazil](https://github.com/danielluis07/clickstudio-bots/issues/18). This is a decision input, not an implementation or onboarding-path decision.

## Answer

Inbound-heavy does not mean free: Meta does not charge incoming Contact messages, but from October 1, 2026 it charges delivered service replies after the first 1,000 service messages per business phone number per month. Utility templates inside the 24-hour service window are also charged. The dated developer documentation and October rate cards take precedence over the public product pricing page, which still advertises free service and a 72-hour free-entry window. [Developer pricing][pricing], [official FAQ][faq].

## Brazil list rates

The market follows the recipient phone number's country calling code (+55), rather than the sender's location. Charges apply on delivery, not attempted sending, and not to messages users send the business. The downloaded cards explicitly say effective October 1, 2026. Rates below are per delivered business-to-user message, before applicable taxes or partner/software fees. [Developer pricing][pricing], [USD card][usd], [BRL card][brl], [FAQ][faq].

| Category | USD card | BRL card | Rule |
| --- | ---: | ---: | --- |
| Marketing | 0.0625 | 0.3217 | Charged unless qualifying free entry point applies |
| Utility | 0.0068 | 0.0350 | Charged inside and outside customer service window; volume tiers apply |
| Authentication | 0.0068 | 0.0350 | Volume tiers apply |
| Service | 0.0068 | 0.0350 | First 1,000 per business phone number/month free; charged from 1,001 |
| Authentication-international | n/a | n/a | Brazil has no separate international rate in these cards |

Marketing figures here are the fixed Cloud API list rates; the developer page says the Marketing Messages API can vary per message when its max-price feature is selected. These are independent published currency cards, not a live USD/BRL conversion. Use the account's billing currency. Meta Business Agent is a separate, token-priced category and is excluded from the calculations here; it must not be confused with a third-party bot's service messages. [USD card][usd], [BRL card][brl], [developer pricing][pricing].

## Volume tiers

Only utility and authentication receive these tiers. Count paid messages separately by market/category, aggregated across messaging accounts in the business portfolio; free entry point messages do not count. Counts reset monthly at midnight in the messaging account timezone. Each rate applies only to messages in that band, not retroactively to all messages. Service and marketing have no volume discount under these cards. [Developer pricing][pricing], [USD tiers][usd-tiers], [BRL tiers][brl-tiers].

| Utility monthly messages | Authentication monthly messages | Discount | USD/message | BRL/message |
| --- | --- | ---: | ---: | ---: |
| 1â€“250,000 | 1â€“500,000 | 0% | 0.0068 | 0.0350 |
| 250,001â€“2,000,000 | 500,001â€“3,000,000 | 5% | 0.0065 | 0.0333 |
| 2,000,001â€“17,000,000 | 3,000,001â€“5,250,000 | 10% | 0.0061 | 0.0315 |
| 17,000,001â€“35,000,000 | 5,250,001â€“10,000,000 | 15% | 0.0058 | 0.0298 |
| 35,000,001â€“70,000,000 | 10,000,001â€“20,000,000 | 20% | 0.0054 | 0.0280 |
| 70,000,001+ | 20,000,001+ | 25% | 0.0051 | 0.0263 |

Use published rounded rates, rather than deriving exact amounts by multiplying the discount percentage. An ordinary SMB is far below the first threshold. [USD tiers][usd-tiers], [BRL tiers][brl-tiers].

## Windows and free traffic

- A user message opens a 24-hour customer service window; subsequent user messages reset it. This is the permission window for service/free-form replies, not a blanket pricing exemption. October changes explicitly remove the previous service and in-window utility exemptions. [Developer pricing][pricing].
- The first 1,000 delivered service messages per business phone number per month are free, with no rollover. This counts messages, not Contacts, conversations, or all categories. The reset follows the messaging account timezone. Without a payment method, service delivery stops once the allowance is exhausted. Incoming user messages remain uncharged. [Developer pricing][pricing], [FAQ][faq].
- The dated developer page says a Click-to-WhatsApp ad on Android/iOS opens the customer service window; a business reply within that window opens a free entry point (FEP) window, and that initial reply is free. It says the FEP can remain open **up to 7 days**. While open, marketing, utility, authentication and service are free; Meta Business Agent remains chargeable. Do not equate this maximum with a guaranteed seven-day duration for every entry point. [Developer pricing][pricing].
- The public product pricing page still says 72 hours and includes Facebook Page CTA buttons. The dated current developer section specifically describes CTWA and up to seven days; this research does not establish that every Facebook CTA qualifies under the October terms. Confirm actual FEP eligibility/duration before pricing such traffic at zero. [Public product page][public], [developer pricing][pricing].

## Who receives the bill

For direct platform access, Meta supports a business's credit card or a Meta credit line with monthly invoicing. Meta recommends a credit line above expected USD 10,000/month. With a Solution Provider, Meta bills the provider directly for usage; the provider's separate commercial terms determine what the Tenant pays it. Partner value-added fees may apply, and applicable taxes appear on the invoice. Thus WABA ownership and fee liability must be recorded separately. [Official FAQ][faq].

For a Tenant using its own WABA and payment method, the direct-billing model keeps Meta usage on the Tenant's payment method and the SaaS subscription separate. For partner credit-line billing, Meta bills the partner as payer and the Tenant pays the partner according to their contract. This is a billing consequence, not a recommendation of either onboarding route. The exact Tech Provider versus Solution Partner eligibility and credit-line-sharing mechanics should be settled by the separate onboarding research; this note does not assert that an ordinary Tech Provider automatically receives a credit line. [Official FAQ][faq].

BRL localization began July 1, 2026; the developer note says all eligible Solution Providers and directly integrated businesses could create BRL accounts from July 16. Eligibility uses Brazil as sold-to country in Billing Hub. BRL accounts are invoiced in BRL by Facebook Brasil. Eligible customers must migrate all portfolio messaging accounts to BRL by June 30, 2027; Meta says it will stop delivering messages for their non-BRL accounts from July 1, 2027. Account currency is chosen at creation and is not edited in place; Meta provides currency migration APIs. Existing October accounts must therefore be checked rather than assumed to already use BRL. [Developer pricing, billing localization for Brazil][pricing].

## Illustrative SMB monthly Meta bills

These are arithmetic scenarios, not observed customer averages. Assume one business number, only +55 recipients, no FEP traffic, no volume discounts, all messages delivered, ordinary third-party automation rather than Meta Business Agent, and no taxes, SaaS, model inference, hosting, or BSP markup. The figures count **outgoing replies**, independently of incoming Contact messages. [Rates][brl], [allowance rules][pricing].

| Monthly traffic | BRL Meta fee | USD-card equivalent calculation |
| --- | ---: | ---: |
| 800 service replies; no templates | 0.00 | 0.00 |
| 4,000 service replies + 200 utility + 50 marketing | 128.085 (~128.09) | 24.885 (~24.89) |
| 10,000 service replies + 500 utility + 100 marketing | 364.67 | 70.85 |

For the middle example: `(4,000 âˆ’ 1,000) Ã— 0.035 + 200 Ã— 0.035 + 50 Ã— 0.3217 = 128.085 BRL`. In USD billing: `3,000 Ã— 0.0068 + 200 Ã— 0.0068 + 50 Ã— 0.0625 = 24.885 USD`. Actual invoice rounding may differ; USD figures are from the USD card and are not FX conversions. The planning implication is to estimate business reply counts and categories; inbound Contact counts alone cannot predict the bill.

## Evidence and remaining limits

The web browsing tool received HTTP 429 for the developer page. A direct PowerShell HTTPS request succeeded; its embedded documentation identifies `lastUpdated: 2026-09-30` and explicitly says it reflects October 1 changes. Official CDN assets linked by that page were downloaded directly and their Brazil rows parsed. Despite `.csv` URLs/CSV link labels, the downloaded payloads are ZIP/XLSX workbooks; the workbook headings themselves state effective October 1, 2026. No secondary source is used as authority for the rates. CDN URLs are signed and may expire; rediscover replacement assets through the canonical developer pricing page under rate cards and volume tiers.

The public product page is inconsistent with both that dated developer document and the official FAQ's explicit October service rule. Preserve that distinction if these findings are quoted. FEP maximum versus actual duration and Facebook CTA qualification remain operational checks. No actual Tenant invoice, tax registration, BSP contract, card settlement, account currency, or provider eligibility was inspected; these determine the final invoice. This note does not evaluate WhatsApp AI-provider policies or claim that the Meta Business Agent token fee applies to this product.

## Primary sources

[pricing]: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/
[faq]: https://whatsappbusiness.com/resources/faq/
[public]: https://whatsappbusiness.com/products/platform-pricing/
[usd]: https://scontent.fcfc8-1.fna.fbcdn.net/v/t39.8562-6/829311379_1537421421402610_366484812346475911_n.csv?_nc_cat=111&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=b8d81d&_nc_ohc=MJvAMvO_p8IQ7kNvwFlZde3&_nc_oc=Adq-b8pOHyCWDq_dfl-Sm46I4Oba1s5mQcJwWXOkPetFuv-arJzqQ8C2W2JRWz1SrUHYVh5obZGxQuak1zCWO9V6&_nc_zt=14&_nc_ht=scontent.fcfc8-1.fna&_nc_gid=TGTFe3l5eLa7qdxy95XZvg&_nc_ss=7d20f&oh=00_AQMviKPz5wWOJ-FYmFu7bBJiIN05OAWpEe5FQcQu2F3eIA&oe=6ADC0B82
[brl]: https://scontent.fcfc8-1.fna.fbcdn.net/v/t39.8562-6/829788045_1617107983472492_8786695655875075995_n.csv?_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=b8d81d&_nc_ohc=JFRgmlFMeSoQ7kNvwFuZVRR&_nc_oc=Adp92M2BqYRzGCgNnIRMTo7TN4D9IePkDCEcbUUA-vBWE7Qdqoz45OeT-3dJMeah_Zmru3yk2dWP0njeasKOpK7v&_nc_zt=14&_nc_ht=scontent.fcfc8-1.fna&_nc_gid=TGTFe3l5eLa7qdxy95XZvg&_nc_ss=7d20f&oh=00_AQO7c1EowDgAWYksfLjeCw7o2OO51GPQzkFb3CUlaiVQXQ&oe=6ADC2400
[usd-tiers]: https://scontent.fcfc8-1.fna.fbcdn.net/v/t39.8562-6/830197941_1665057081977768_2267409043178611359_n.csv?_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=b8d81d&_nc_ohc=4Yz5F0eem5kQ7kNvwF4ncBD&_nc_oc=Adod8VqxRnjAJaK69TLSJ-pZ-6l5dbA3HICVGfxrJsI5tnOOQTjZaWOOqAc8R37WB2O7iCNFHqvaN0YFl5dZAGsF&_nc_zt=14&_nc_ht=scontent.fcfc8-1.fna&_nc_gid=TGTFe3l5eLa7qdxy95XZvg&_nc_ss=7d20f&oh=00_AQP0ict2z6ZKv8b6WEFR_RvjtCt65fI-IMPX9qGX1T5J7A&oe=6ADC2557
[brl-tiers]: https://scontent.fcfc8-1.fna.fbcdn.net/v/t39.8562-6/829269450_2510706652768127_6060894304695032806_n.csv?_nc_cat=107&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=b8d81d&_nc_ohc=SIu67dwUkPAQ7kNvwGWr1Nv&_nc_oc=AdpJVK3vBWydJwrZcCr6KYMfFQXeCJ82MR7L00R_wpRIhK6HXl7vMpyNrHivuFNKr-Leb74cKnCBodQZBWuCFNDS&_nc_zt=14&_nc_ht=scontent.fcfc8-1.fna&_nc_gid=TGTFe3l5eLa7qdxy95XZvg&_nc_ss=7d20f&oh=00_AQPWnzXWtQ52IrxziuabWZinghZ2Cm3O5o92xgKO5axUJg&oe=6ADC0711
