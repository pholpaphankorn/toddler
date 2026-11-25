---
title: What GitHub and GitLab expose for mergeability, CI logs and auto-merge
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 8
status: open
assignee: claude (research subagent)
---
## Question

For the four forge additions settled in [Forge and tracker modules](../../7-harness-boundary/issues/63-forge-tracker-modules.md), what do `gh` and `glab` (and the REST/GraphQL APIs behind them, using only the host's CLI login) expose for:

1. Mergeability of a PR/MR, including "branch must be up to date with the base" (GitHub `mergeStateStatus` `BEHIND`, GitLab `detailed_merge_status` `need_rebase` and friends) and "a human review is required".
2. CI status of the PR head, failing check/job names, and the tail of each failing log (GitHub `statusCheckRollup`, `gh run view --log-failed`; GitLab pipelines, jobs, job trace). Size limits, retention, whether logs for checks from other apps are reachable.
3. Pushing a host-made merge commit to the PR branch: anything that blocks it (branch protection, "require linear history", rebase-only GitLab projects).
4. Enabling auto-merge / merge-when-pipeline-succeeds, then telling "landed", "still waiting" and "auto-merge was cancelled" apart (e.g. GitHub disables auto-merge when new commits are pushed by some actors), and the cheapest way to poll it.

Cite docs and CLI versions; mark anything not tried against a real repo.
