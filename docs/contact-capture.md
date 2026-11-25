# Capturing Contact details

Issue: [#58](https://github.com/danielluis07/clickstudio-bots/issues/58).
Decision: [capabilities #28](https://github.com/danielluis07/clickstudio-bots/issues/28#issuecomment-6273991713).

The Tenant owner sets up capture at **Painel → Bot → Contatos e links**
(`/painel/bot/contatos-e-links`), under **Captura de dados do contato**. Capture is disabled until the first save. Each field is either not
captured, optional, or required. "Required" means the Bot asks for the field
once before calling the team, not that the Handoff waits for it (see
[Required details before a Handoff](#required-details-before-a-handoff)):

| Field | Stored as | Bound |
| --- | --- | --- |
| Nome | the Contact's name, the same one Members edit | 100 characters |
| E-mail | `contact.email`; must be a valid address | 254 characters |
| Cidade | `contact.city` | 100 characters |
| Necessidade | `contact.need`, free text in the Contact's words | 500 characters |

Enabling capture requires at least one captured field. Disabling it keeps the
field choices for later. Other Members can see the settings but not change
them. A saved change applies to the next Bot reply. Owners must not configure
capture of sensitive data.

Values live on the Contact, with no lead or request entity. They are shared
across the Contact's Conversations. Members edit them in the Contact panel's
**Salvar dados** form, and a blank field clears that value. Owner-only
**Excluir contato** deletes them with the Contact row.

## How the Bot captures

With capture enabled, the core offers a `capture_contact_details` tool whose
schema contains only the Tenant's chosen fields. Validation happens on the
server, whatever the provider checked:

- A disabled capability offers no capture tool, and a call to it is refused.
- The input is a strict object. A field the Tenant did not choose, a malformed
  email, a blank or over-long value, an empty call, or any extra key (such as a
  Contact or Tenant id) refuses the whole response. The model gets one retry,
  then the turn hands off as `bot_unavailable`.
- The write targets only the Contact of the turn's Conversation, resolved under
  the turn's `ChannelRoute`, and checks each value again before saving.
- Valid details are stored immediately, even if the reply is later not sent.
- A captured email, city or need replaces the saved one. A captured name only
  fills an empty name, because Members also give the Contact its name; a
  Member's correction is never replaced. The sandbox follows the same rule.
- A response that captures without writing a reply gets one tool round trip,
  so the model can write that reply. It is metered as a tool round trip.

The capture choices go into the cached instructions. The turn's Contact
details are sent separately, after the cached prefix, and list only the
chosen fields. The phone number is never sent. With capture disabled, no
Contact details are sent at all.

## Required details before a Handoff

This is the catalog's one deterministic rule. When the model hands off as
`no_answer`, `contact_request` or `handoff_topic` and a required
detail is still missing, counting values captured in the same response, the
Bot does not hand off. It sends the answerable part, if any, followed by:

> Antes de chamar a equipe, me informe seu nome e seu e-mail, por favor.

The Conversation stays with the Bot, and the put-off Handoff's reason is
stored with the request on the Conversation (`pending_handoff_reason`, #105).
The Contact's next message completes that Handoff with its stored reason,
whether or not the model calls `handoff` again. Details captured in that turn
are saved first, and the reply carries the model's text, if any, followed by
the reason's Handoff notice. A capture without a reply hands off at once,
without the usual extra tool round trip.

The pending reason is cleared by any Handoff (the Bot's, a system one or a
Member's, such as **Assumir** or a reply), by **Resolvida** and by
**Devolver ao Bot**. A Bot reply other than the request also clears it,
although the next turn after a request always hands off. A request whose
send fails hands off as `bot_unavailable`, which clears it too.

These are the uncertain cases, each covered by a core test:

- **The Contact does not answer the request.** The Bot asks once; this
  ask-once rule was approved during review of #58. The next message completes
  the Handoff with whatever was given, so a Contact who declines is never
  stuck. A required field is therefore asked for once, never enforced.
- **The model gives another reason** on the next message. The Handoff keeps
  the stored reason: it completes the one the Bot promised.
- **The Model fails** on the next message. The Handoff is `bot_unavailable`,
  as for any provider failure; the Conversation still reaches the waiting
  list.
- **A later Handoff after other replies.** Once a Handoff or a Member has
  cleared the pending reason, a new Handoff asks again for what is still
  missing.
- **Optional fields** are never asked for.
- **Capture disabled.** Required flags have no effect.
- **System Handoffs** (`bot_unavailable` for provider or tool failures,
  `allowance_exhausted` for the allowance) and every Member Handoff happen at once.
  They are never delayed for missing details.

Changing this rule reopens the capability decision; do not substitute another.

## Sandbox

**Testar Bot** uses the same core, tools and rule. The sandbox has no
Contact: captured details go back to the page, which shows them under
**Dados capturados neste teste**. The page resends them with the next test
message, validated against the same bounds. A details request's put-off
Handoff is kept the same way: the response's answer carries `pendingHandoff`,
and the page sends it back, so the next test message completes it. Both
disappear with the transcript.
No production Contact, Conversation or message is read or written.

## Deployment and verification

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). The migration adds the
`bot_capture_settings` table (one row per Tenant, created on the first save)
and the nullable `email`, `city` and `need` columns on `contact`. The
pending Handoff migration (#105) adds the nullable
`conversation.pending_handoff_reason`, null for existing rows: a request sent
before that deploy is not completed automatically, and a later model Handoff
asks once more.

```powershell
bun test test/modules/bot/core.test.ts test/modules/bot/capture.test.ts
bun test test/modules/bot/live.test.ts test/modules/bot/sandbox.test.ts
bun test test/modules/conversations/inbox.test.ts test/trpc/router.test.ts
```

Entry points: `modules/bot/capture.ts` (settings, tool input and the
required-details rule), `modules/bot/turn.ts`, `modules/bot/tools.ts`,
`modules/conversations/contact-details.ts` (shared bounds),
`modules/conversations/contacts.ts` (Contact writes),
`components/bot/bot-capture-form.tsx` and
`components/inbox/contact-details-form.tsx`.
