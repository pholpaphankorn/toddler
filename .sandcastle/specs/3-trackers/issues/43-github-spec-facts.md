---
title: GitHub facts for specs on a GitHub tracker
labels: [wayfinder:research, adult]
blocked_by: []
parent: 3
status: closed
assignee: claude (research subagent)
---
## Question

From primary GitHub sources (REST/GraphQL docs, `gh` docs, changelog), what can hold a **spec** (a document grouping a set of issues) on a GitHub tracker:

- Sub-issues: availability (all plans? public/private?), REST and GraphQL endpoints to list a parent's sub-issues and an issue's parent, nesting limits, `gh` support.
- Issue types and issue fields: availability (org-only?) and API.
- Milestones and labels as weaker alternatives.
- Whether a parent issue's sub-issues and issue dependencies (`dependencies/blocked_by`, already used by toddler) can be read in one call, and rate-limit cost for ~100 issues.

## Answer

Full findings: `docs/research/github-spec-facts.md` (sources: GitHub docs, REST/GraphQL reference, changelog, gh manual). No live API calls; two items (the personal-account issue types date, the 2026-08-20 token-scope filtering) come from search excerpts only.

- **Sub-issues are GitHub's native way to hold a spec**: the parent issue is the spec and its body is the text. GA since 2025-04-09. Limits: 100 sub-issues per parent, 8 nesting levels, one parent per issue, sub-issues from same-owner repos allowed. No documented plan or visibility limits.
- **APIs**: REST `GET …/issues/{n}/sub_issues` (100 per page) and `…/parent`; adding takes the numeric issue *id*, not the number. GraphQL has `Issue.subIssues`, `Issue.parent` and `addSubIssue`.
- **`gh` support needs v2.94.0** (2026-06-10): `--parent`, `--blocked-by`, and JSON `parent`/`subIssues`/`blockedBy`. This machine has 2.88.1, so toddler either uses `gh api` / `gh api graphql` or requires ≥ 2.94.0.
- **Issue types and fields** label an issue but don't group issues. Available for orgs and, since 2026-11-11, personal accounts. A "Spec" type could mark parent issues.
- **Milestones and labels are weaker options**: both are single-repo; a milestone has no ordering or nesting, and a label has no body and would mix with toddler's work labels.
- **Issue dependencies** have been GA on all plans since 2025-08-21 (REST `dependencies/blocked_by`, GraphQL `Issue.blockedBy`). Unconfirmed: since 2026-08-20, results may be filtered to repos the token can see.
- **One GraphQL call** reads a spec's sub-issues and each one's blockers: about 1 point (calculated, not measured) versus 101 REST requests for 100 issues.
