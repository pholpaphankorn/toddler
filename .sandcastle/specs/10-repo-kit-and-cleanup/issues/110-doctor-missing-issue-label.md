---
title: doctor row for spec children missing issueLabel
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 10
status: closed
assignee: claude (phol session)
---
## Question

How does `doctor` find open spec children that lack `issueLabel` on each forge tracker, and what does the row say?

- What counts as a spec on GitHub (an issue with sub-issues? one carrying a spec label?) and on GitLab (issues named by `Spec: #<iid>` lines), and which API reads list the children within doctor's time budget (see [github-spec-facts](../../../../docs/research/github-spec-facts.md), [gitlab-facts](../../../../docs/research/gitlab-facts.md)).
- Warn or fail; how many issues it names before truncating; what it does when the read fails (no login, rate limit).
- Whether it lives on the `Forge`/tracker seam's `doctorChecks` or in `doctor` itself.

Settled: one row per forge tracker, nothing new for the files tracker ([doctor, setup, init, plan and smoke](../../7-harness-boundary/issues/72-cli-modes.md)).

## Answer

Resolved with phol 2026-11-28 (grilling).

1. **Spec child** = an open issue whose spec is open. GitHub: an issue with a `parent` (any nesting level) whose parent is open. GitLab: an issue with a `Spec: #N` line naming an open issue.
2. **Adult label.** New config key `adultLabel`, default `adult`: an issue carrying it is never picked on any tracker, whatever its other labels (on forges it is skipped even with `issueLabel`, like `blockedLabels`; on files it is the only thing keeping a person's issue out). Glossary: **Adult issue**.
3. **Skipped children**: any carrying `adultLabel` or any `blockedLabels` label. Those are unlabelled on purpose.
4. **FAIL, not warn**, through the existing `check`; no WARN level. OK: `Spec children: N open, all labelled Sandcastle`. FAIL: `Spec children: 3 missing Sandcastle: #41, #42, #57`, numbers only, at most 10 then `(+N more)`.
5. **Read failure** (no login, rate limit, missing field): the row FAILs with the error, like every other row.
6. **Where**: each forge's `doctorChecks`, beside "Issue label", only when `issues === "forge"`. GitHub: one paginated GraphQL `repository.issues(states: OPEN, first: 100)` reading `number`, `labels`, `parent { number state }`, filtered in code (no `gh` >= 2.94 needed). GitLab: paginated `issues?state=opened&per_page=100`, `Spec:` lines parsed as `spec()` does, one `GET` per distinct parent to check it is open.
7. **Relabel once it ships**: wayfinder tickets and maps in `.sandcastle/specs` move `on-hold` -> `adult` (frontmatter, map comments, tracker notes) by an agent or throwaway script, in the same change that adds `adultLabel`. No rename code in toddler. Not before: toddler would pick them.
8. **Kit**: the issue template from [Planning kit templates and the toddler block](108-planning-kit-templates.md) gets one line: label `<adultLabel>` when a person, not toddler, should do it (rendered from config).

