---
title: Blocking and labels on a GitLab tracker
labels: [wayfinder:grilling, on-hold]
blocked_by: [42]
parent: 3
assignee: phol (with claude)
status: closed
---
## Question

How does a GitLab tracker express what infant needs from GitHub today: an issue being blocked by another (GitHub: native `dependencies/blocked_by`) and the work labels (`issueLabel`, `parallelLabel`, `blockedLabels`)?

- If native "is blocked by" links need a paid tier: require that tier, fall back to a body convention (e.g. a `Blocked by #n` line) on Free, or use the convention everywhere on GitLab?
- Whether label settings carry over unchanged, and how scoped labels are treated.
- Blockers outside the work label or in another project: same rule as GitHub (counted while open)?

## Answer

Grilled with phol, 2026-11-16.

- **Blocking on GitLab** comes from two sources; an issue is blocked while any blocker from either is open:
  - native `is_blocked_by` links (`GET /projects/:id/issues/:iid/links`). Premium+ only; on Free the read just returns none, so infant never checks the tier.
  - a body line `Blocked by: #12, #15`: matched case-insensitively at the start of a line, one or more same-project `#<iid>`, the line may repeat. A mention mid-sentence doesn't count.
- **Unresolvable body line** (missing issue, or a cross-project reference like `group/other#4`): the issue counts as **blocked** and infant logs the line. A cross-project blocker needs a native link. Blocking errs toward waiting; the `Spec:` line is lenient only because a spec never gates picking (see [Where specs live on each tracker](45-specs-per-tracker.md)).
- **Which blockers count**: any open blocker, with or without the work label, in any project for native links. Same rule as GitHub.
- **Labels**: `issueLabel`, `parallelLabel`, `blockedLabels` carry over unchanged, no new settings. Scoped labels (`workflow::blocked`) are plain names matched whole.
- **GitHub** keeps native dependencies only; the body line is GitLab's Free-tier workaround, not a shared convention.
- Glossary: **Blocker** added.
