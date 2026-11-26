---
title: How landing is tested
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 8
status: closed
assignee: claude
---
## Question

[The Forge seam's new methods and their local-mode equivalents](78-forge-seam.md) fixed the seam: `deliver` and `poll` return small unions, and `NoneForge` does the local landing. How is landing tested?

- A fake `Forge` that returns scripted `deliver`/`poll` results, driving the landing module and the [merge fix loop](77-merge-fix-loop.md) (auto-merge waits, `behind` → host merge, `ci-failed` → merge fix, `moved` retries, needs attention reasons): what it scripts, and what goes on real git in a temp repo instead (host merge, the host-commit chain proof, `NoneForge`'s compare-and-swap).
- Contract tests for the GitHub and GitLab adapters with a fake `Command`, as the forge tests do today: which raw-field combinations each `poll` precedence case must cover.
- What real `smoke` must check against a scratch repo, given the three behaviours [What GitHub and GitLab expose for mergeability, CI logs and auto-merge](74-forge-landing-apis.md) left untried (GitHub keeping auto-merge after a host push, GitLab merge commit clearing `need_rebase`, GitHub linear history), and whether that runs by hand or in CI.

## Answer

Settled with phol 2026-11-26.

- **The fake `Forge` replaces only `deliver` and `poll`**: a per-job queue of scripted results. Host merges, the host-commit chain proof and the close commit run on real git in a temp repo with a bare remote; `verify` goes through a fake `Sandbox` whose `exec` returns a scripted exit code and output. Tests assert on what landing emits (landed, merge fix + trigger, needs attention + reason) and on the exact SHA handed to `deliver`.
- **The landing suite, one test each**: deliver → `waiting`×n → `landed`, dependents unblocked only then; `behind` → host merge + `verify` pass → deliver again, no agent; `behind` → conflict → merge fix with `MERGE_HEAD` on the pinned SHA; `behind` → `verify` fails → merge fix; `ci-failed` → merge fix with names + tails; every needs-attention reason (`closed`, `review-required`, `auto-merge-off`, `refused`, both caps, `maxReviewRounds` resetting per merge fix round); `none` on resume → deliver; a fixed job rejoins at the back and merge fixes take a slot ahead of fresh issues; a foreign commit in the host-commit chain refuses the publish.
- **`NoneForge` only on real temp repos**: clean compare-and-swap → `landed` with the checked-out clean base fast-forwarded; a lost race (the test moves the base between merge and `deliver`) → `moved` → re-merge → `landed`; a dirty checked-out base → `refused`, checkout untouched; `poll` ancestor → `landed`, else `none`. Includes the regression for "failed fast-forward ends in `done`".
- **Adapter contract tests** stay table-driven in `forge.test.ts` and `gitlab.test.ts` with the fake `Command`: one raw-JSON row per `poll` state, plus the precedence overlaps (closed + conflict, review-required + ci-failed, behind + ci-failed, conflict + ci-failed, GitHub `mergeable: null` → `waiting`); GitLab drops `allow_failure` jobs, cuts the trace to its tail, re-enables auto-merge after every push; GitHub non-Actions checks give a link and no `tail`. `deliver` rows: push refused → `refused`, open request reused, `autoMerge` off → `waiting` without enabling.
- **`toddler smoke forge`**, new and opt-in, run by hand against a scratch repo phol names, never in CI: opens a PR/MR, pushes a host merge, polls, reports what it saw for the three untried behaviours (GitHub keeping auto-merge after a host push, GitLab merge commit clearing `need_rebase`, GitHub linear history), then closes it and deletes the branch. It does not block implementation: the seam already turns each surprise into needs attention.
- **Time**: landing takes an injected `wait(ms)` (real timer by default); tests pass one that resolves at once. No `mock.timers` (it fights the real git child processes). Same seam spec 9's `wakeAt` sleep uses.
- **State and summary**: old `state.json` files (`pr`/`done`, `rounds`, `conflictBase`) as fixtures under `tests/fixtures/state/`, each translation asserted; the run summary tested as text (landed / waiting on you / needs attention) and exit code (1 on either of the last two).
