# Bot behaviour settings and schedule

Issue: [#54](https://github.com/danielluis07/clickstudio-bots/issues/54).

The Tenant owner sets up the Bot in two parts, each saved on its own:

- The **Business profile** at **Painel → Bot → Perfil do negócio**
  (`/painel/bot/perfil`): business name, offer, address and opening hours.
- The **Behaviour settings** at **Painel → Bot → Comportamento**
  (`/painel/bot/comportamento`): tone, emoji, greeting, rules, refused and
  Handoff topics, and the schedule.

These are bounded form settings, not a flow builder. Other Members can see them
but not change them. A saved change applies to the next Bot reply and the next
schedule check, including in open Conversations. There are no drafts or
versions.

Saving one part leaves the other as it is. Each page shows when and by whom its
own part was last saved. Before a part's first save, the Bot uses its defaults:
the Tenant's name and no offer, address or hours for the profile; neutral tone,
no emoji, and always on for the behaviour. The activation checklist's
**Perfil do negócio** step is done only once the Business profile itself has
been saved.

"Outside business hours only" needs at least one open day, and each part is
checked against the other as saved now: the Behaviour settings refuse that
schedule while the saved profile has no open day, and the Business profile
refuses closing every day while that schedule is saved. The check runs in the
statement that writes, so two owners saving the two parts at once cannot leave
the Bot "outside business hours" with no hours.

## Settings and bounds

Text is trimmed before it is saved, form line breaks count as one character,
and an accented letter or emoji counts as one character. Profile fields do not
count toward the Knowledge base's 30,000-character cap. The limits are
implementation settings (`botSettingsLimits` in `modules/bot/settings.ts`), not
commercial promises.

| Setting | Bound |
| --- | --- |
| Business name | Required, up to 100 characters. Before the first save it defaults to the Tenant's name. |
| Offer | Up to 500 characters |
| Address | Up to 300 characters |
| Opening hours | For each weekday, either closed or one opening interval (`HH:MM`, 24-hour clock, São Paulo time). The business must open before it closes, on the same day, so an interval cannot cross midnight. The latest closing time is `23:59`. |
| Tone | Formal, neutral or casual. Defaults to neutral. |
| Emoji | Allowed sparingly, or never. Defaults to never. |
| Greeting | Up to 300 characters |
| Rules (free text) | Up to 2,000 characters |
| Refused topics | Up to 20 topics, one per line, each up to 100 characters. The Bot politely declines them without a Handoff. |
| Handoff topics | Up to 20 topics, one per line, each up to 100 characters. The Bot hands the Conversation off as `handoff_topic`. |
| Schedule | Always on, or outside business hours only. Defaults to always on. Outside business hours only needs at least one open day. |

## Prompt

`renderInstructions` places the settings in the system/behaviour part of the
cached prompt prefix (tools → instructions → Knowledge base). Blank settings are
left out. Opening hours are left out when no day has hours, so the Bot treats
them as unknown, not closed. The schedule is never in the prompt, so changing it
does not invalidate the provider's cache.

## Schedule eligibility

`scheduleAllows(settings, at)` returns whether the schedule lets the Bot reply
at that instant. The live reply gate calls it with the settings saved now:

- **Always on**: always true.
- **Outside business hours only**: false from the opening minute until the
  closing minute (exclusive) of the São Paulo weekday, otherwise true. A closed
  day is outside business hours all day.

Weekday and time come from `America/Sao_Paulo` for every Tenant, whatever the
server's time zone.

The schedule is one of the conditions the [reply gate](live-bot.md#reply-gate)
checks, before and after each Model call. A false result only stops the Bot from
sending. It never hands a Conversation off. Saving a schedule change writes only
the settings row: no Conversation moves to the waiting list and no ownership
changes.

## Deployment

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). The migration adds the
`bot_settings` table (one row per Tenant, created on the first save) and does
not change existing data.

A later migration adds when and by whom each part was last saved
(`profile_updated_at`, `profile_updated_by_member_id`, `behaviour_updated_at`,
`behaviour_updated_by_member_id`). Every earlier save saved both parts, so it
copies the row's `updated_at` and `updated_by_member_id` into both. The row's
own `updated_at` stays the last save of either part, which a test must not
predate.
