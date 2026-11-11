# Handoff ownership and controls

Issue: [#57](https://github.com/danielluis07/clickstudio-bots/issues/57).
Decision: [Handoff #29](https://github.com/danielluis07/clickstudio-bots/issues/29#issuecomment-6274170033).

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). The migration adds the Conversation's
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

## States and transitions

Issue: [#184](https://github.com/danielluis07/clickstudio-bots/issues/184).

Five columns of `conversation` decide who owns a Conversation and what happens
next: `owner`, `handoff_reason`, `waiting`, `resume_on_contact_message` and
`returned_by_member_at`. The only functions that write them are `handOff` and
`resume` in `modules/conversations/handoff.ts`; every transition below calls
one of the two. Read this section before adding a rule here, such as the
return at the end of Business hours that
[ADR 0008](adr/0008-automatic-return-to-the-bot.md) defers, and update it in
the same change.

### States

| State | `owner` | `handoff_reason` | `waiting` | `resume_on_contact_message` |
| --- | --- | --- | --- | --- |
| **Bot** | `bot` | null | false | false |
| **Bot, waiting**: returned, not yet **Resolvida** | `bot` | any reason | true | false |
| **Team** | `team` | any reason | true | false |
| **Team, returns on the Contact's message**: a `bot_unavailable` Handoff no Member has acted on | `team` | `bot_unavailable` | true | true |

`returned_by_member_at` is not part of the state. It holds when a Member last
returned the Conversation, for the
[daily cap per Contact](bot-reply-allowance.md#daily-cap-per-contact), and
may be set in any state.

These combinations must never occur:

- `waiting` true with no `handoff_reason`, or a `handoff_reason` with
  `waiting` false. They are set together and cleared together.
- `owner` `team` with `waiting` false.
- `resume_on_contact_message` true unless `owner` is `team` and the reason is
  `bot_unavailable`.

No database constraint enforces them. The transition tests in
`test/modules/conversations/handoff.test.ts` check all three after every
transition.

### The Bot lease

The Bot lease (`bot_lease_token`, `bot_lease_until`) is written only by
`claim`, `release` and `clearExpired` in `bot-turns.ts` (see
[Locks and leases](locking.md#leases)). It never changes the state, but it
fences the writes a live turn makes. The reply gate's Handoffs pass the
turn's token, so a turn whose lease expired cannot hand off. Reservation
renews the lease only while it still holds the token and the Conversation is
Bot-owned. Every other transition ignores the lease. A turn that is running
when one of them commits finds out at reservation, which refuses a team-owned
Conversation or a settled snapshot.

### Handoffs

Each one calls `handOff(reason)`. Applied to a Conversation in **Bot** or
**Bot, waiting**, it leaves:

| Column | Afterwards |
| --- | --- |
| `owner` | `team` |
| `handoff_reason` | the Handoff's reason, replacing any earlier one |
| `waiting` | true |
| `resume_on_contact_message` | true for `bot_unavailable`, false otherwise |
| `returned_by_member_at` | unchanged |

| Trigger | Reason | Writer |
| --- | --- | --- |
| Member command: **Assumir** | `claimed` | `takeOver`, `handoff.ts` |
| Member command: dashboard reply, stored before Meta is called | `dashboard_reply` | `insertPendingReply`, `repository.ts` |
| Member's app reply: a new echo that matches no own send | `app_reply` | `recordMessageEcho`, `echoes.ts` |
| Member's app reply: an echo filed while a Bot reply awaited its wamid, still unmatched once the wamid is stored | `app_reply` | `resolveUnresolvedEchoes` from `recordSentWamid`, `echoes.ts` |
| Contact message: an audio, or media with no caption | `no_answer` | `recordInboundMessage`, `inbound.ts` |
| The Bot's turn: the Model hands off, or its unavailability notice | `no_answer`, `contact_request`, `handoff_topic`, `bot_unavailable` | `reserve`, `bot-turns.ts`, in the reservation that stores the notice |
| The Bot's turn: the reply gate, under the turn's lease | `allowance_exhausted`, `contact_cap_reached`, `bot_unavailable` | `handOff` on `LiveBotTurn` (`handOffAndNotify` with the lease token), `bot-turns.ts` |
| The Bot's turn: a failed send, or a pending reply left without a wamid by an earlier turn | `bot_unavailable` | `failPending`, `bot-turns.ts` |
| The sweep: a pending reply stranded by an expired lease | `bot_unavailable` | `failPending` from `recoverStaleBotTurns`, `bot-turns.ts` |

Applied to a Conversation in **Team** or **Team, returns on the Contact's
message**, a Handoff changes nothing, so the reason stays the one that put it
with the team. The one exception: a Member's Handoff (`claimed`,
`dashboard_reply`, `app_reply`) sets `resume_on_contact_message` false, moving
**Team, returns on the Contact's message** to **Team**.

A Handoff settles no Contact message. Those a live turn answered were settled
by its reservation. The rest stay unanswered until a return decides.

### Returns to the Bot

Each one calls `resume`. All four set `owner` to `bot` and
`resume_on_contact_message` to false.

| Trigger | From | Writer | `handoff_reason`, `waiting` | `returned_by_member_at` | Unanswered Contact messages |
| --- | --- | --- | --- | --- | --- |
| Member command: **Devolver ao Bot**, one or many | any state | `returnToBot`, `bulkReturnToBot`, `handoff.ts` | unchanged | now | settled for the Bot, if it was with the team |
| Member command: **Resolvida** | any state | `resolve`, `handoff.ts` | null, false | now | settled for the Bot, if it was with the team |
| Contact message: the first delivery of a new message | **Team, returns on the Contact's message** only | `resumeOnContactMessage` from `recordInboundMessage`, `inbound.ts` | unchanged | unchanged | left for the Bot, which answers them all |
| The sweep: no message from either side for 24 hours | **Team** or **Team, returns on the Contact's message** | `returnQuietHandoffs`, `handoff.ts` | unchanged | unchanged | settled for the Bot |

So **Devolver ao Bot** and the two automatic returns lead to **Bot, waiting**,
and **Resolvida** leads to **Bot**. A Member return of a Conversation already
with the Bot changes only `returned_by_member_at`, and for **Resolvida** clears
the waiting item; it settles nothing, because those messages are the Bot's
current turn.

Settling sets `bot_answered` on every Contact message in
`unansweredContactMessages`, in the same transaction as the return. The Bot
then answers only the Contact's next message. Only the Contact-message return
leaves them unanswered, because no Member acted during that Handoff, so no
one answered them (see [Resuming](#resuming)).

An audio or a captionless media message that returns a **Team, returns on the
Contact's message** Conversation then hands it straight off again as
`no_answer`, in the same transaction: the end state is **Team** with reason
`no_answer`.

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

The transition tests at the end of `handoff.test.ts` cover every row of
[States and transitions](#states-and-transitions).

Entry points: `modules/conversations/handoff.ts` (Member commands and the
shared Handoff write), `modules/conversations/echoes.ts`,
`modules/conversations/bot-turns.ts`, `trpc/routers/conversations.ts` and
`components/inbox/handoff-controls.tsx`.
