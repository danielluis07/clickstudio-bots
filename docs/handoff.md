# Handoff ownership and controls

Issue: [#57](https://github.com/danielluis07/clickstudio-bots/issues/57).
Decision: [Handoff #29](https://github.com/danielluis07/clickstudio-bots/issues/29#issuecomment-6274170033).

Run `bun run db:migrate` before deploying. The migration adds the Conversation's
`waiting` flag and the message's `echo_unresolved` flag. Conversations already
with the team are put on the waiting list. The automatic return's migration
(#139) adds `resume_on_contact_message`, false for existing rows: a
`bot_unavailable` Handoff from before it returns only after a quiet service
window, since there is no telling whether a Member acted on it.

The reasons were renamed from Portuguese identifiers to English in
[#173](https://github.com/danielluis07/clickstudio-bots/issues/173). Its
migration rewrites the stored `conversation.handoff_reason` and
`bot_turn_record.handoff_reason` values.

## What Members see

Each Conversation in the list and in its header shows its owner, **Bot** or
**Equipe**, an **Aguardando** badge while it is on the waiting list, and the
pt-BR reason of the latest Handoff. **Aguardando equipe** above the list (URL
`?filtro=aguardando`) shows only waiting Conversations.

| Reason | Shown as | Cause |
| --- | --- | --- |
| `no_answer` | O Bot não soube responder | Model Handoff |
| `contact_request` | O contato pediu atendimento | Model Handoff |
| `handoff_topic` | Regra do negócio | Model Handoff |
| `bot_unavailable` | Bot indisponível | Provider, sender or uncertain send failure |
| `allowance_exhausted` | Limite de respostas atingido | Allowance hook refused |
| `contact_cap_reached` | Limite diário do contato atingido | [Daily cap per Contact](bot-reply-allowance.md#daily-cap-per-contact) reached |
| `claimed` | Assumida por um membro | **Assumir** |
| `dashboard_reply` | Membro respondeu pelo painel | Dashboard reply |
| `app_reply` | Membro respondeu pelo app | Unmatched app echo |

The schema enum is the single list of reasons, exported as
`ConversationHandoffReason`. The Bot's Model reasons and its system reasons are
declared as a type-checked subset of it.

Every Handoff is written by `handOff` in `modules/conversations/handoff.ts`:
**Assumir**, dashboard replies, app echoes, the live turn's Model Handoff in its
reservation, failed sends and the reply gate's system Handoffs. It only moves a
Bot-owned Conversation. A live turn passes its lease token, so a turn whose
lease expired cannot hand off. Callers inside a transaction notify the inbox
after they commit; others use `handOffAndNotify`, which notifies only when the
Conversation changed hands.

A Bot-initiated Handoff sends its short notice to the Contact through the
normal reservation and send gates. System Handoffs (`bot_unavailable`,
`allowance_exhausted`, `contact_cap_reached`) send nothing.

## Taking over

- **Assumir** hands a Bot-owned Conversation to the team without sending.
- A dashboard reply hands off in the same transaction that stores the pending
  reply, before Meta is called, so a failed send still silences the Bot.
- A new outbound app echo whose wamid is not an own send hands off. Matched own
  echoes, repeated echoes, edits/revokes (`original_message_id`) and imported
  history never do.

A Handoff of a Conversation already with the team keeps its original reason,
including a failed Bot send after **Assumir**. Every Handoff puts the
Conversation on the waiting list.

An echo can arrive before Meta answers the Bot's own send, while its pending
row has no wamid yet. Such an echo is filed with `echo_unresolved`, without a
Handoff. When the send's wamid is stored, a matching echo row gives way as
before; any unresolved echo left was a Member's app reply and hands off as
`app_reply`. A failed or stuck send already hands off as
`bot_unavailable`. If the worker crashes after reserving, the Conversation
keeps showing **Bot** until the next turn or the
[sweep](inbox-operations.md#the-sweep) fails the stuck send; the Bot sends
nothing meanwhile, because the pending row
blocks every retry. A Conversation row lock serializes echo filing with the
send's outcome.

## Resuming

Any Member can resume, whoever took over. A Conversation also returns to the
Bot on its own in two cases
([#139](https://github.com/danielluis07/clickstudio-bots/issues/139),
[ADR 0008](adr/0008-automatic-return-to-the-bot.md)).

- **Devolver ao Bot** returns ownership to the Bot. The Conversation stays on
  the waiting list with its reason.
- **Resolvida** returns ownership to the Bot, clears the reason and removes the
  waiting item. It is also offered for a Bot-owned Conversation still waiting.
- **The Contact writes after a `bot_unavailable` Handoff** that no Member has
  acted on. The provider has likely recovered; if not, the turn hands off
  again. **Assumir**, a dashboard reply or an app echo after the Handoff is a
  Member acting on it, even though the reason stays `bot_unavailable`. The
  Conversation's `resume_on_contact_message` flag tracks this: only a
  `bot_unavailable` change of hands sets it, and any Member Handoff or return
  clears it. Only a new Contact message returns it, never a redelivery. An
  audio or a media message with no caption returns the Conversation and then
  hands it off again as `no_answer`.
- **A service window passes with no message from either side.** The
  [sweep](inbox-operations.md#the-sweep) returns any Handoff whose last message,
  from the Contact, a Member or the Bot, is at least 24 hours old. This
  applies to every reason, `bot_unavailable` included. The Bot could not reply
  outside the window anyway; it answers the Contact's next message.

Both automatic returns behave as **Devolver ao Bot**: the Conversation stays on
the waiting list with its reason, so the team still sees what happened.

When a Conversation leaves the team, every live Contact message still unanswered
(the same `unansweredContactMessages` a Bot turn answers) is settled for the Bot
in the same transaction: those received during the Handoff,
and any question the Bot had not answered before it, which the team now owns.
They remain visible to the Model as Conversation history. The Bot answers only
the next Contact message; it never replies to the Handoff backlog. Reservation
requires every message in the turn's snapshot to still be unanswered, so a
Handoff and resume during a turn's Model call cannot answer that backlog either.
The quiet-window return settles the backlog the same way.

The return on the Contact's next message is the exception. No Member acted
during the Handoff, so nobody answered its backlog, and the Bot's next turn
answers every Contact message still unanswered, including the one that
returned the Conversation. A failed send or the Model's unavailability notice
already covered the messages of the turn that handed off; a turn the reply
gate handed off before reserving left them unanswered, and they are answered
now.

All four ways back to the Bot go through the one `resume` in
`modules/conversations/handoff.ts`.

## Remaining race

The pre-send check runs inside the reservation transaction, immediately before
Meta is called: it rechecks ownership along with pause, activation,
subscription and the service window. A Handoff committed before reservation
prevents the send. It cannot see a Member's app reply whose echo is late or
never arrives (WhatsApp for Windows and WearOS send no echo). If the Member
replies in the app while the Bot is generating and the echo is processed after
the Bot's reservation, both replies reach the Contact; the echo then hands off
and the Bot stays silent afterwards. The real-number coexistence test measures
echo latency to size this window.

## Verification

```powershell
bun test test/modules/conversations/handoff.test.ts test/trpc/router.test.ts
```

Entry points: `modules/conversations/handoff.ts` (Member commands and the
shared Handoff write), `modules/conversations/echoes.ts`,
`modules/conversations/bot-turns.ts`, `trpc/routers/conversations.ts` and
`components/inbox/handoff-controls.tsx`.
