# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `danielluis07/clickstudio-bots`.
Use the `gh` CLI from this repo.

## Conventions

- Create: `gh issue create --title "..." --body-file <path>`.
  For multiline bodies, write the exact text to a temporary file.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
  Apply appropriate label and state filters.
- Comment: `gh issue comment <number> --body-file <path>`.
- Label: `gh issue edit <number> --add-label "..."`.
- Remove a label: `gh issue edit <number> --remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

Infer the repository from the Git remote, or pass
`--repo danielluis07/clickstudio-bots` explicitly.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read the GitHub issue.

For parent/child work, use native GitHub sub-issues when available.
Otherwise, add child links to the parent's task list and put
`Part of #<parent>` at the top of each child body.

For blocking relationships, use native GitHub issue dependencies when
available. Otherwise, put `Blocked by: #<number>` at the top of the
dependent issue. Work is unblocked when all blockers are closed.

For wayfinding, use one `wayfinder:map` issue and linked child issues
labelled `wayfinder:research`, `wayfinder:prototype`,
`wayfinder:grilling`, or `wayfinder:task`. Select the first open,
unassigned, unblocked child in map order. Claim it by assigning
yourself. Record the result, close the child, and add a decision
summary with its link to the map.
