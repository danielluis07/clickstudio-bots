# Member activity

Issue: [#155](https://github.com/danielluis07/clickstudio-bots/issues/155).

`member_activity` is an append-only log of what Members and the platform
administrator did to a Tenant's data: who, what, on which record, when. It
answers "who did this?" for a Tenant owner's question or an incident
investigation. It holds ids only: never message text, names, emails or phone
numbers.

## What is recorded

Each action writes its entry in the same transaction as the change, through
`recordMemberActivity` (`modules/tenancy/activity.ts`). A refused or failed
action writes nothing, and an entry that cannot be written rolls the change
back.

| Action | Actor | Subject | Written by |
| --- | --- | --- | --- |
| `conversation.taken_over` | Member | Conversation | "Assumir", only when the Conversation changed hands |
| `conversation.returned_to_bot` | Member | Conversation, one entry each | "Devolver ao Bot", single and bulk |
| `conversation.resolved` | Member | Conversation | "Resolvida" |
| `contact.deleted` | Owner | Contact | Contact deletion |
| `invitation.created` | Owner, or administrator for the owner's invitation | Invitation | Inviting a Member, creating a Tenant |
| `invitation.canceled` | Owner | Invitation | Cancelling an invitation |
| `invitation.accepted` | The new Member | Invitation | Accepting an invitation |
| `member.removed` | Owner | Member | Removing a Member |
| `bot.activated` | Owner | none | Activating the Bot |
| `bot.paused`, `bot.unpaused` | Member | none | Pausing and resuming the Bot |
| `behaviour_settings.saved`, `capture_settings.saved`, `link_settings.saved` | Owner | none | Saving settings |

The actor is a user id, so it also covers the administrator, who has no
Member row. Returns to the Bot that no one made (a Contact's message after a
"Bot indisponível" Handoff, a quiet service window) are not Member actions and
are not recorded.

Not recorded yet: Knowledge entry edits, Contact detail edits, dashboard
replies (the message already stores its author) and the administrator's inbox
replays. A replayed inbox event has no Tenant until it is processed, and may
never have one.

## Decisions

- **Visibility.** Platform only for now. There is no dashboard screen; the
  administrator reads the table, and the Tenant export includes it.
- **Retention.** Entries live as long as their Tenant. Tenant deletion removes
  them; nothing else does.
- **Export.** Part of the Tenant export, as `memberActivity`.
- **Deleted records.** An entry keeps the id of the Contact, Member or
  Conversation it named. After the record is deleted, the id no longer resolves
  and nothing in the entry identifies the person.

## How append-only is enforced

A trigger, `member_activity_append_only`, refuses every `UPDATE` and
`TRUNCATE`, and refuses a `DELETE` while the entry's Tenant row exists. Tenant
deletion (`pruneCanceledTenants`) deletes the organization first, then the
entries, in one transaction.

The table has no foreign keys. A reference to the Tenant would add a lock to
every recorded action (see [Locks and leases](locking.md#member-activity-entries)),
and a reference to the actor or the subject would cascade entries away with
them.
