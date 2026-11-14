---
title: GitHub facts for specs on a GitHub tracker
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 3
status: open
---
## Question

From primary GitHub sources (REST/GraphQL docs, `gh` docs, changelog), what can hold a **spec** (a document grouping a set of issues) on a GitHub tracker:

- Sub-issues: availability (all plans? public/private?), REST and GraphQL endpoints to list a parent's sub-issues and an issue's parent, nesting limits, `gh` support.
- Issue types and issue fields: availability (org-only?) and API.
- Milestones and labels as weaker alternatives.
- Whether a parent issue's sub-issues and issue dependencies (`dependencies/blocked_by`, already used by toddler) can be read in one call, and rate-limit cost for ~100 issues.
