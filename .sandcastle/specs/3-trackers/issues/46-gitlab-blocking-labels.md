---
title: Blocking and labels on a GitLab tracker
labels: [wayfinder:grilling, on-hold]
blocked_by: [42]
parent: 3
status: open
---
## Question

How does a GitLab tracker express what toddler needs from GitHub today: an issue being blocked by another (GitHub: native `dependencies/blocked_by`) and the work labels (`issueLabel`, `parallelLabel`, `blockedLabels`)?

- If native "is blocked by" links need a paid tier: require that tier, fall back to a body convention (e.g. a `Blocked by #n` line) on Free, or use the convention everywhere on GitLab?
- Whether label settings carry over unchanged, and how scoped labels are treated.
- Blockers outside the work label or in another project: same rule as GitHub (counted while open)?
