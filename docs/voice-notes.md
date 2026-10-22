# Voice notes: deferred

On 2026-10-22, [#62](https://github.com/danielluis07/clickstudio-bots/issues/62)
was removed from the required MVP scope. Voice transcription may be considered
for a future implementation; no delivery date or provider is committed.
This decision supersedes the voice-transcription requirements in the earlier
planning resolutions and the original MVP specification (#37).

- Treat voice notes of any duration as unsupported media under #61: show a pt-BR
  placeholder directing the Member to WhatsApp and hand off. Other unsupported
  media can still be answered when an answerable caption suffices.
- Do not download or store audio, create a `Transcriber` port or Groq adapter,
  retain transcripts/durations, meter voice minutes or require an audio switch
  for the MVP.
- Provider acceptance (#63) evaluates text replies, including measured model
  cost at 5,000 replies (at most R$20 per Tenant). Voice recordings, transcription
  quality/cost and Groq terms are not launch gates.
- Public Privacy, Terms/DPA, deletion instructions and the subprocessor list must
  describe the current scope without promising transcription or listing Groq
  as a current provider.

The voice-note evaluation template is retained only for possible future use.
Before introducing transcription, reopen its scope and provider decision,
evaluate authorized pt-BR recordings and combined costs, verify data handling
and vendor terms, and update legal disclosures and deletion coverage.
