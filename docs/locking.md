# Locks and leases

Issue: [#153](https://github.com/danielluis07/clickstudio-bots/issues/153).
Lease design: [ADR 0002](adr/0002-serverless-only-with-qstash-and-postgres-lease.md).

This page lists every database lock and every lease in `modules/`, what each
protects, and the one order they are taken in. Read it before adding a lock, a
`for("update")`/`for("share")`, an advisory lock or a lease column, or before
making a transaction write to a table it did not write before. Update the page
in the same change.

## Locks and leases are different things

A **lock** is held by Postgres until its transaction ends. While one
transaction waits for a lock another holds, it does nothing else, so two
transactions taking two locks in opposite orders can deadlock. Every lock here
is transaction-scoped: `for("update")`, `for("share")`,
`pg_advisory_xact_lock`, and the row locks Postgres takes on its own (see
[Implicit row locks](#implicit-row-locks)). None is session-scoped, and none is
released early.

A **lease** is a token and an expiry stored in a row. Claiming one is a single
short `UPDATE ... where lease is free` (or a write under a lock that is already
held), and a claimant that finds it taken gets `busy` and never waits. Leases
take part in no deadlock. They are what protects work that spans an external
call: the database lock is gone by then.

## The ordering rule

Take locks in this order. Skip the ranks you do not need, but never wait for a
lock of a lower rank while holding one of a higher rank. Take several rows of
one table in ascending id.

| Rank | Lock | Kind |
| --- | --- | --- |
| 1 | wamid lock (`tenantId:wamid`) | advisory |
| 2 | Tenant row (`organization`) | `for share` or `for update` |
| 3 | Contact address lock (`contact:<sha256(tenantId:phone)>`) | advisory |
| 4 | Rows owned by the Tenant, from owner to owned. Inbox side: Contact → Conversation → Message. Tenancy side: Channel, Invitation → User → Member, Knowledge entry | row |
| 5 | Reply usage row (`bot_reply_usage`, Tenant and month) | row |

Why this order:

- The **wamid lock** comes first because an echo has to know whether its wamid
  is already stored before it decides to admit anything. Nothing that holds the
  Tenant row or a Contact lock ever asks for a wamid lock.
- The **Tenant row** comes before everything else in the Tenant, because
  cancellation and deletion hold it `for update` to shut out every writer that
  holds it `for share`.
- The **Contact address lock** comes before any row about that Contact, so
  that admission and Contact deletion settle first who wins.
- The **reply usage row** is a counter shared by the whole Tenant. It is taken
  last so it is held for the fewest statements, and nothing waits on another
  lock while holding it.

### Implicit row locks

Postgres locks rows that are not written as `for(...)`. They count toward the
rule:

- `UPDATE` and `DELETE` lock every row they change, like `for update`.
- `INSERT ... ON CONFLICT DO UPDATE` locks the existing row it updates.
- `ON DELETE CASCADE` and `ON DELETE SET NULL` lock the child rows they touch,
  in the order Postgres chooses.
- Inserting a row that references another takes `for key share` on the
  referenced row. That blocks only deleting that row or changing its key, never
  the ordinary updates below.
- A row the transaction has just inserted is invisible to others, so locking it
  never waits. A concurrent insert of the same unique key does wait. Every such
  key here is already serialised by a lock of a lower rank: the wamid, the
  Contact address or the Conversation row.

### Member activity entries

Many Member and administrator actions end their transaction with an insert into
`member_activity` (`recordActivity`, `modules/tenancy/activity.ts`; see
[Member activity](member-activity.md)). The table has no foreign keys and no
unique key besides a fresh id, so the insert takes no lock that can wait, and
it adds no rank. That is deliberate: a reference to the Tenant row would take
`for key share` on it after the action's row locks, a rank 4 → 2 wait that
could deadlock with `inviteMember`, which holds the Tenant row `for update` and
then waits on Invitation rows.

Recording made these actions transactions where they were single statements:
"Assumir" (the Handoff `UPDATE` of one Conversation), cancelling an invitation
(one Invitation row), pausing the Bot (the Channel row) and the three settings
saves (one settings upsert). Each still takes one row lock.

## Every lock

### Advisory locks

| Lock | Protects | Taken in | Released |
| --- | --- | --- | --- |
| wamid lock | Every write about one wamid of a Tenant: giving a sent message its wamid, filing that wamid's echo, recording its delivery status or keeping it as an early status. Without it, an echo or a status can race the send's own answer. | `lockWamid` (`modules/conversations/wamid-lock.ts`), called by `recordSentWamid` and `recordMessageEcho` (`echoes.ts`) and `recordMessageStatus` (`statuses.ts`) | At commit |
| Contact address lock | Creating and deleting a Contact at one address. A job that started before a deletion either commits first, and is deleted, or reads the deletion barrier and files nothing that predates it. | `lockContact` (`modules/conversations/contact-deletion.ts`), called by `withContactAdmission` and `deleteContact` | At commit |

### Row locks written as `for(...)`

| Site | Lock | Protects |
| --- | --- | --- |
| `withContactAdmission`, `contact-deletion.ts` | Tenant row `for share` | Admission against cancellation and Tenant deletion: a job that already resolved a Channel either finishes before cancellation commits, or sees `canceled_at` and files nothing. |
| `acceptInvitation`, `modules/tenancy/onboarding.ts` | Tenant row `for share` | Joining a Tenant against its cancellation or deletion. |
| `claim` (cancel, reactivate, disconnect), `modules/tenancy/lifecycle.ts` | Tenant row `for update` | Claiming the Tenant lifecycle lease and recording cancellation, against every `for share` holder. |
| `reactivate`, `lifecycle.ts` | Tenant row `for update` | Clearing `canceled_at` only while the lease token is still this operation's and the recovery window is open. |
| `claimSubscription`, `modules/channels/repository.ts` | Tenant row `for update` | Claiming the Tenant lifecycle lease for a Member's subscription. |
| `finishSubscription`, `channels/repository.ts` | Tenant row `for update` | Releasing that lease, or keeping it to unsubscribe, with no cancellation slipping in between the check and the release. |
| `finishCanceledSubscription`, `channels/repository.ts` | Tenant row `for update` | Recording the compensating unsubscribe and releasing the lease. |
| `pruneCanceledTenants`, `modules/tenancy/retention.ts` | Tenant row `for update` | Rechecking that the Tenant is still past recovery and holds no live lease before deleting it. |
| `pruneCanceledTenants`, `retention.ts` | User rows `for update`, ascending id | Deciding which of the Tenant's Users are no longer needed by any Tenant or role. |
| `inviteMember`, `modules/tenancy/members.ts` | Tenant row `for update` | The seat count: two invitations at once cannot both take the last seat. |
| `removeMember`, `members.ts` | User row `for update` | Deleting a User with no other membership: an acceptance elsewhere must wait for it, so the check cannot miss that acceptance. |
| `saveWithinCap`, `modules/knowledge-base/editor.ts` | Tenant row `for update` | The Knowledge base size cap: two saves at once cannot both fit under it. |
| `lockConversation`, `modules/conversations/echoes.ts` (from `recordSentWamid` and `recordMessageEcho`) | Conversation row `for update` | Filing an echo against the outcome of the Bot reply that may be its source. |
| `failPending`, `modules/conversations/bot-turns.ts` | Conversation row `for update` | Failing a pending Bot reply against a reservation and the sweep's cleanup. |
| `reserve`, `bot-turns.ts` | Message rows `for update` (the snapshot's unanswered Contact messages) | That the snapshot is still unanswered when the Bot reply is reserved: a Member's resume cannot settle it at the same moment. |
| `resume`, `modules/conversations/handoff.ts` | Conversation rows `for update`, ascending id | Returning one or many Conversations to the Bot. The order keeps bulk returns from deadlocking with each other. |
| `reserve` (allowance), `modules/bot/allowance.ts` | Reply usage row `for update` | The monthly reply allowance: the counter and the pending reservations are read together, so concurrent turns cannot overshoot. |

### Leases

| Lease | Columns | Protects | Taken | Released | Lasts |
| --- | --- | --- | --- | --- | --- |
| Bot lease | `conversation.bot_lease_token`, `bot_lease_until` | One Bot turn per Conversation, across the Model call and the send to Meta. Every write of the turn is fenced by the token: `reserve`, `consume`, and `handOff` with `leaseToken`. The ownership transitions it fences are listed under [The Bot lease](handoff.md#the-bot-lease). | `claim` in `bot-turns.ts` (one conditional `UPDATE`), renewed by `reserve` | `release` in `runBotTurn`'s `finally`; after a crash, `clearExpired` in `recoverStaleBotTurns` | `botLeaseMs`, 120 s, renewed at reservation |
| Tenant lifecycle lease | `organization.lifecycle_token`, `lifecycle_lease_until` | One Meta subscribe or unsubscribe per Tenant at a time: cancellation, disconnection, reactivation and a Member's subscription. Retention skips a Tenant that holds one. | `claim` in `lifecycle.ts` and `claimSubscription`, both under the Tenant row lock | `release` in `lifecycle.ts`'s `finally`; `finishSubscription` or `finishCanceledSubscription` | `tenantOperationLeaseMs`, 120 s |
| Reply warning lease | `bot_reply_usage.warning_claim_token`, `warning_lease_until` | Sending the 80% allowance email once per Tenant and month, across the call to the mailer. | `deliverWarning` in `allowance.ts` (one conditional `UPDATE`) | Same function, after the send succeeds or fails. An expired claim is retried by `retryWarnings`. | 60 s |

If a cancellation finds a Member's subscription holding the lifecycle lease, it
records `canceled_at` at once and leaves the lease alone. The subscription's
`finishSubscription` then sees the cancellation and unsubscribes before it
releases the lease.

`channel.app_contacts_sync` and `history_sync` move from `pending` to
`requested` in `claimSync`. That is a one-time state change with no expiry,
not a lease.

## How long locks are held

Every lock above lasts only as long as its transaction, and every transaction
that takes one does database work only. No lock is held across a call to the
Model, the Meta Graph API, the mailer, QStash or the inbox notifier:

- A Bot turn snapshots, calls the Model, reserves, sends and acknowledges in
  separate transactions. Only the Bot lease spans the calls.
- Tenant lifecycle operations commit their claim, call Meta, then lock the
  Tenant row again to finish. Only the lifecycle lease spans the call.
- Invitations and the reply warning send their email after the transaction
  commits.
- Every caller notifies the inbox after its transaction commits.
- `beforeReserve` (allowance and daily Contact cap) and `onAcknowledged`
  (reply usage) run inside the transaction, but only read and write the
  database.

A lease may span external calls. The expiry bounds it, and an expired holder's
token no longer matches, so its later writes change nothing.

## Every path that takes more than one lock

Ranks are those of the [ordering rule](#the-ordering-rule).

| Path | Order taken |
| --- | --- |
| Inbound message, edit or revoke, imported history, app contact (`withContactAdmission`) | Tenant row (2, share) → Contact address (3) → Contact row, upsert (4) → Conversation row, upsert (4) → `resumeOnContactMessage`/`handOff` on that same Conversation (4) → Message rows (4) |
| Echo (`recordMessageEcho`) | wamid (1) → admission in a savepoint: Tenant row (2, share) → Contact address (3) → Contact row → Conversation row `for update` (4) → message insert and early status. An error inside rolls back the whole transaction, so no lock outlives a failure. |
| Delivery status (`recordMessageStatus`) | wamid (1) → Message row, or the early status row (4) |
| Bot or dashboard reply acknowledged (`recordSentWamid`) | wamid (1) → Conversation row `for update` (4) → Message rows (4) → Handoff on that same Conversation → reply usage upsert (5), Bot replies only |
| Bot reply reservation (`reserve`) | Conversation row, fencing `UPDATE` (4) → Message rows `for update` (4) → reply usage row `for update` (5) → message insert → Handoff on that same Conversation |
| Pending Bot reply failed (`failPending`) | Conversation row `for update` (4) → Message rows (4) → Handoff on that same Conversation |
| Return to the Bot (`resume`) | Conversation rows `for update`, ascending id (4) → Message rows (4) → those same Conversations |
| Dashboard reply stored (`insertPendingReply`) | New message row → Conversation row (4). The new row is invisible to others, so the Conversation row is the only lock that can wait. |
| Contact deletion (`deleteContact`) | Contact address (3) → message changes → Contact row → cascade to Conversation → Message (4) → inbox events. Message changes are only ever written under this Contact's address lock, and inbox events only by single statements outside any transaction, so nothing that holds one of those rows waits for another lock. |
| Cancel, disconnect, reactivate (`claim`) | Tenant row `for update` (2) → Channel rows (4) |
| Member subscription (`claimSubscription`, `finishSubscription`, `finishCanceledSubscription`) | Tenant row `for update` (2) → Channel rows (4) |
| Invitation (`inviteMember`) | Tenant row `for update` (2) → Invitation rows (4) |
| Invitation accepted (`acceptInvitation`) | Tenant row `for share` (2) → Invitation row → new User → new Member (4) |
| Knowledge entry saved (`saveWithinCap`) | Tenant row `for update` (2) → Knowledge entry (4) |

### Exceptions

**`removeMember` locks the Member row before the User row.** Its `DELETE` of the
Member comes first, then `for update` on the User. That reverses the
User → Member order, and the delete also sets `author_member_id` to null on
that Member's messages and Knowledge entries. The only other transaction that
locks a User and then deletes Member rows is Tenant deletion. It deletes only
the Member rows of a canceled Tenant, which no `TenantScope` resolves to, so
`removeMember` can never hold one of them. Tenant deletion deletes a User only
when no Member row of theirs is visible, so it never cascades into the Member
row that `removeMember` holds. No path that holds a Message or Knowledge entry
row waits for a User or Member row.

**Tenant deletion (`pruneCanceledTenants`) takes everything in cascade order.**
It locks the Tenant row `for update`, then its Users, then deletes the Tenant.
Postgres then cascades through every Tenant-owned table in its own order,
including Conversations, Messages and the reply usage row, which breaks rank
4 → 5. That is safe for these reasons:

- The Tenant was canceled more than `tenantRecoveryDays` ago and holds no live
  lifecycle lease. Both are rechecked under the lock.
- A canceled Tenant resolves no `ChannelRoute` and no `TenantScope`, so no
  inbound event, Bot turn, acknowledgment, status or dashboard action can start
  for it.
- Admission and invitation acceptance hold the Tenant row `for share` and wait
  behind the deletion, then find the Tenant gone.

If a path that writes to a canceled Tenant without a route or scope is ever
added, it must lock the Tenant row `for share` first, as admission does.

## Adding a lock

1. Find its rank in [the ordering rule](#the-ordering-rule). If it fits none,
   choose a place and give the reason here.
2. Check every path in [the table of paths](#every-path-that-takes-more-than-one-lock)
   that will take it together with another lock, counting
   [implicit row locks](#implicit-row-locks).
3. Never hold it across an external call. Use a lease when work must span
   one.
4. Add it to this page in the same change.
