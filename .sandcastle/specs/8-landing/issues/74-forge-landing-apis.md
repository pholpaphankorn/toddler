---
title: What GitHub and GitLab expose for mergeability, CI logs and auto-merge
labels: [wayfinder:research, adult]
blocked_by: []
parent: 8
status: closed
assignee: claude (research subagent)
---
## Question

For the four forge additions settled in [Forge and tracker modules](../../7-harness-boundary/issues/63-forge-tracker-modules.md), what do `gh` and `glab` (and the REST/GraphQL APIs behind them, using only the host's CLI login) expose for:

1. Mergeability of a PR/MR, including "branch must be up to date with the base" (GitHub `mergeStateStatus` `BEHIND`, GitLab `detailed_merge_status` `need_rebase` and friends) and "a human review is required".
2. CI status of the PR head, failing check/job names, and the tail of each failing log (GitHub `statusCheckRollup`, `gh run view --log-failed`; GitLab pipelines, jobs, job trace). Size limits, retention, whether logs for checks from other apps are reachable.
3. Pushing a host-made merge commit to the PR branch: anything that blocks it (branch protection, "require linear history", rebase-only GitLab projects).
4. Enabling auto-merge / merge-when-pipeline-succeeds, then telling "landed", "still waiting" and "auto-merge was cancelled" apart (e.g. GitHub disables auto-merge when new commits are pushed by some actors), and the cheapest way to poll it.

Cite docs and CLI versions; mark anything not tried against a real repo.

## Answer

Researched 2026-11-25 from docs, first-party source and local `--help` (`gh` 2.104.0, `glab` 1.115.0). Nothing was run against a real repo. Full findings: `docs/research/forge-landing-apis.md` on local branch `research/forge-landing-apis` (commit `73a2c3e`, not pushed).

- **Mergeability.**
  - GitHub: `gh pr view --json mergeable,mergeStateStatus,reviewDecision`. `BEHIND` blocks only when required checks must be up to date. Every rule violation shows as `BLOCKED`, so a required human review is read from `reviewDecision == REVIEW_REQUIRED`. `mergeable` can be null while GitHub computes it, so retry.
  - GitLab: the MR's `detailed_merge_status` (`need_rebase`, `not_approved`, `conflict`, `ci_must_pass`, `ci_still_running`, …). `need_rebase` exists only on fast-forward and semi-linear projects; merge-commit projects have no "must be up to date" block. Required approvals need Premium.
- **CI status and log tails.**
  - GitHub: `gh pr checks --json name,state,bucket,link`. Raw logs exist only for Actions (`gh run view --log-failed`, or the jobs logs endpoint, whose link expires in 1 minute; logs kept 90 days by default). Checks from other apps give only a summary or text (up to 65535 chars) and a link.
  - GitLab: the MR's `head_pipeline`, then its failed jobs (drop `allow_failure` jobs), then the job trace. The trace returns the whole log, so toddler cuts the tail itself. External CI gives no logs.
- **Pushing the host's base merge.**
  - GitHub: a plain push passes unless rules on the head branch block it. A push from someone with write access should not cancel auto-merge. Stale-approval dismissal and "approval of the most recent push" rules can turn the PR into review-required. A base branch that requires linear history clashes with merge commits.
  - GitLab: **any push to the source branch aborts auto-merge**, so the host must re-enable it after pushing. On rebase-only projects, source code says a merge commit clears `need_rebase`, while the docs say "rebase": unverified.
- **Auto-merge and polling.** One read per poll tells the three states apart:
  - GitHub (`state`, `autoMergeRequest`): `MERGED` = landed; `OPEN` with the request set = waiting; `OPEN` with it null = cancelled. The cancel reason codes are undocumented.
  - GitLab (`state`, `merge_when_pipeline_succeeds`): `merged`, `opened` with true, `opened` with false. A failed pipeline does not cancel it. Target pushes on fast-forward projects also abort it.
- **To verify on a real repo before relying on them** (the doc's "Open / not verified" section): GitHub keeping auto-merge after a host push; GitLab's merge commit clearing `need_rebase`; GitHub's linear-history interaction.
