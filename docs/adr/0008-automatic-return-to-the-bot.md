# Return a Conversation to the Bot without a Member in two cases

Until #139, only a Member could return a Conversation to the Bot, with **Devolver ao Bot** or **Resolvida**. That left two gaps. A `bot_unavailable` Handoff caused by a provider incident lasted until a Member noticed it, long after the provider recovered. A Handoff from a Member's app reply silenced the Bot indefinitely, so a business working from the WhatsApp Business app would rarely see the Bot answer a returning Contact.

A Conversation now also returns to the Bot in two cases:

- **On the Contact's next message, after a `bot_unavailable` Handoff no Member has acted on.** The Bot's next turn answers every Contact message still unanswered, the new one included, because no Member answered them. If the provider is still down, the turn retries transient failures (#138) and hands off again.
- **After a whole service window with no message from either side**, for any reason. The five-minute sweep (ADR 0007) returns Handoffs whose last message is at least 24 hours old. Their backlog is settled as after **Devolver ao Bot**, and the Bot answers from the Contact's next message.

Both keep the Conversation on the waiting list with its reason, as **Devolver ao Bot** does. Only **Resolvida** takes it off.

A Member acting on a `bot_unavailable` Handoff does not change its reason: a Handoff of a Conversation already with the team keeps the reason that put it there. So the reason alone cannot tell whether a Member is on the Conversation. The Conversation's `resume_on_contact_message` flag does. Only a `bot_unavailable` change of hands sets it. **Assumir**, a dashboard reply, an app echo, and every return to the Bot clear it.

[States and transitions](../handoff.md#states-and-transitions) lists every ownership state, every Handoff and return with its trigger and writer, and the combinations of columns that must never occur.

## Considered Options

- **Never (dashboard-only):** rejected. It leaves both gaps above.
- **A setting per Tenant:** rejected for now. It adds a setting, a screen and a combination to test, for behaviour no Tenant has asked to change. The quiet window covers the common case safely.
- **Return when Business hours end, for Tenants whose Schedule answers outside them:** rejected for now. It would make the Bot answer the same night after a Member's daytime app reply, but it needs a judgement of whether the Member is still talking, and a window rule is simpler to reason about. Revisit if Tenants on that Schedule still see the Bot silent.
- **Return `bot_unavailable` Handoffs on the Contact's next message without a guard:** rejected. It would take a Conversation away from a Member who claimed it, or who is mid-reply in the app.
- **Detect Member activity from message origins after a Handoff timestamp:** rejected. It misses **Assumir**, which sends nothing, and needs a timestamp column anyway.
- **Settle the backlog on the Contact-message return, as a Member's return does:** rejected. The backlog would include the message that triggered the return, so the Bot would answer nothing.

## Consequences

- Members still see an automatically returned Conversation under **Aguardando equipe** until someone marks it **Resolvida**.
- A Member who stays silent in a Conversation for 24 hours loses it to the Bot. Replying, or the Contact writing, keeps it with the team for another window.
- A Member's app reply that never produces an echo (WhatsApp for Windows, WearOS) is invisible, as in the remaining race in `docs/handoff.md`. After a `bot_unavailable` Handoff, the Contact's next message would then return the Conversation to the Bot.
- `bot_unavailable` Handoffs from before the migration have the flag false and return only after the quiet window.
- The sweep's scan of team-owned Conversations uses a partial index on `last_message_at` where the owner is the team.
