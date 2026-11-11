# Configured Tenant links

Issue: [#59](https://github.com/danielluis07/clickstudio-bots/issues/59).

At **Painel → Bot → Links do negócio**, the Tenant owner adds, edits or removes
labelled links and enables the capability. Other Members can read the list but
cannot change it. Removal requires the shared confirmation dialog; changes take
effect after **Salvar links**. Disabling preserves the saved list.

The bounded list accepts up to 20 links, each with a unique UUID, a single-line
label of up to 100 characters and an HTTP(S) URL of up to 2,048 characters.
Credentials, whitespace inside URLs and non-HTTP protocols are rejected. At
least one link is required to enable sending. These limits are implementation
settings, not commercial promises. Labels and URLs are trimmed before saving.

Every turn reads the current Tenant's saved list. The Model sees labels and IDs,
and the `send_configured_link` tool accepts only `linkId`, enumerated from that
list. Extra arguments, arbitrary URLs, foreign/removed IDs and disabled tools
are rejected by the core. The entire response is refused if any call is invalid;
the Model gets one correction attempt, then a safe Handoff. No URL is fetched
and there is no HTTP action or booking/payment integration.

A successful link call produces a reply from the exact URL and fixed pt-BR
wording explaining that sending a link does not confirm a booking or payment.
Labels are used for selection, never echoed as assertions. Model prose in that
response is discarded. Combined link replies are limited to 3,840 characters,
reserving 256 characters for a Handoff or required-detail notice within the
4,096-character message limit. An oversized selection is refused for correction,
never truncated; a second invalid selection safely hands off. A simultaneous
Handoff keeps the link and adds the usual notice (or required-detail request).
The shared prompt directs the Model to use this tool for links and to hand off
requests for unavailable links or booking/payment status.

## Verify in Testar Bot

1. Save an enabled link named **Agendamento** and another named **Pagamento**.
2. In **Testar Bot**, ask “Pode me enviar o link de agendamento?” and check the
   exact saved URL and the notice that sending it does not confirm anything.
3. Ask for the payment link and then ask whether payment has been confirmed.
   Sending the link must not assert payment; status requests require the team.
4. Edit the saved URL and ask again. Only the updated URL should be sent.
5. Disable and save. Ask again; the tool must be unavailable. Re-enable or
   remove a link and save to verify those changes as well.

The sandbox uses the same core, reads and tool validation as production, with
no Channel requirement or production Contact/Conversation writes. No link
destination is visited. These checks use saved changes; unsaved edits do not apply.

## Deployment

CI applies the migration in production before the new code serves ([ADR 0009](adr/0009-production-migrations-gate-the-vercel-promotion.md)). The additive migration creates
`bot_link_settings`, with one row per Tenant, deletion cascading from the Tenant
and the saving Member reference becoming null if the Member is removed. It
does not enable sending for existing Tenants.
