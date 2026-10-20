# Public and legal pages

Implements [#39](https://github.com/danielluis07/clickstudio-bots/issues/39), using the commercial contract in [#37](https://github.com/danielluis07/clickstudio-bots/issues/37) and the locked [LGPD resolution in #36](https://github.com/danielluis07/clickstudio-bots/issues/36#issuecomment-6277633321).

| Route | Purpose |
| --- | --- |
| `/` | Public offer and invite-only onboarding explanation |
| `/privacidade` | Privacy draft and retention disclosure |
| `/termos` | Terms draft; `#dpa` links to the DPA annex |
| `/exclusao-de-dados` | Public email deletion instructions for Meta App Review |
| `/subprocessadores` | Provider purposes, categories and locations; Meta listed separately |

All pages are public, server-rendered and available without authentication. The public route group owns its header/footer and scoped theme; dashboard routes can retain their own layout. No advertising or analytics tags, non-essential cookies or cookie banner are introduced.

The owner confirmed **Daniel Assunção** as encarregado and **bombdaniel@hotmail.com** as the public privacy mailbox during implementation. This explicit confirmation supersedes the `privacidade@` mailbox proposal in #36. The shared contact is in `modules/legal/public-site.ts`.

## Before production publication with real data

The legal pages are drafts, as required by #39. They disclose pending configuration instead of inventing a deployed provider plan or retention window. Serving these documents does not implement the future deletion, export, incident, invitation-assent or retention workflows.

- Confirm the privacy mailbox is monitored and test delivery of a deletion request.
- Confirm the selected model provider after evaluation. Anthropic is provisional in the locked plan and these drafts. If it changes, update Privacy, Terms/DPA and Subprocessors together before sending data to the replacement.
- Record the actual Neon plan and recovery window, Vercel plan/log retention, Sentry retention, QStash message/log/dead-letter retention and Ably region constraints. Replace pending statements in the public drafts with the actual production configuration.
- Verify US East hosting, EU QStash, EU Sentry, diagnostics scrubbing, identifiers-only queue/realtime payloads and Groq zero retention against the deployed configuration.
- Record content vendors' answers about ANPD standard clauses. Obtain Brazilian counsel's opinion on the art. 33 IX / art. 7 V transfer approach; the draft makes no claim that vendor EU clauses establish Brazilian compliance.
- Have Brazilian counsel review the final texts and contracting-party details before the first paying Tenant goes live, as required by #36. Keep the interim drafts accessible for App Review by build week 4.
- After the app is deployed to its production domain, use the public Privacy, Terms and deletion URLs in Meta's app settings. These routes are written instructions, not a deletion callback endpoint.

## Primary sources checked on 2026-10-19

The project decisions determine the commercial and contractual commitments. Official sources were checked to avoid making unsupported vendor-retention claims:

- [Neon history window](https://neon.com/docs/postgres/backup-restore/history-window): defaults and limits differ by plan; production settings remain to be selected.
- [Vercel runtime logs](https://vercel.com/docs/logs/runtime): retention varies by plan and Observability Plus.
- [Anthropic API retention](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data): standard 30-day retention with legal/abuse exceptions; this is not an unconditional maximum.
- [Groq data controls](https://console.groq.com/docs/your-data): zero-retention controls apply to content, while usage metadata remains; retained customer data is located in the US.
- [Resend GDPR disclosure](https://resend.com/security/gdpr): storage is in the US regardless of the sending region; email/log retention is normally 30 days, with separate backup/account-termination rules.
- [Ably message storage](https://ably.com/docs/storage-history/storage): two-minute default recovery storage; persistent history is optional.
- [QStash regions](https://upstash.com/docs/qstash/howto/multi-region) and [pricing/limits](https://upstash.com/pricing/qstash): separate regional infrastructure and plan-dependent dead-letter retention. Do not infer a universal message/log retention from these limits.
- [ANPD incident communication guidance](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis): the controller's regulatory notification deadline is distinct from the operator's contractual 24-hour notice.

## Acceptance checks

Use `bun run typecheck`, `bun run lint`, `bun run test` and `bun run build`. In a browser, open all five routes without a session; check the four footer links, page titles, pt-BR content, `#dpa`, the deletion mailto subject, keyboard navigation, and desktop/mobile layouts. Confirm no third-party tracking requests or non-essential cookies. No permanent UI snapshots or browser-test dependencies are required for these static drafts.
