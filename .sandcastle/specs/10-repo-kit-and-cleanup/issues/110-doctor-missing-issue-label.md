---
title: doctor row for spec children missing issueLabel
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 10
status: open
---
## Question

How does `doctor` find open spec children that lack `issueLabel` on each forge tracker, and what does the row say?

- What counts as a spec on GitHub (an issue with sub-issues? one carrying a spec label?) and on GitLab (issues named by `Spec: #<iid>` lines), and which API reads list the children within doctor's time budget (see [github-spec-facts](../../../../docs/research/github-spec-facts.md), [gitlab-facts](../../../../docs/research/gitlab-facts.md)).
- Warn or fail; how many issues it names before truncating; what it does when the read fails (no login, rate limit).
- Whether it lives on the `Forge`/tracker seam's `doctorChecks` or in `doctor` itself.

Settled: one row per forge tracker, nothing new for the files tracker ([doctor, setup, init, plan and smoke](../../7-harness-boundary/issues/72-cli-modes.md)).
