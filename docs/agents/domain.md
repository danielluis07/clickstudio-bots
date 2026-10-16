# Domain docs

This repository uses a single-context layout:
- `GLOSSARY.md` at the repository root.
- Architecture decision records under `docs/adr/`.

## Before exploring

Read the glossary and ADRs relevant to the work.
If `GLOSSARY-MAP.md` exists, follow its pointers to relevant glossaries.

If these documents are absent, proceed silently. Do not suggest
creating them upfront. The domain-modeling skill creates them
when terms or decisions are resolved.

## Use the glossary's vocabulary

Use defined domain terms in issues, proposals, code, and tests.
Avoid synonyms the glossary explicitly rejects.

If a needed concept is missing, reconsider the terminology or
note the gap for domain-modeling.

## Flag ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR,
and explain why reopening the decision is warranted.
