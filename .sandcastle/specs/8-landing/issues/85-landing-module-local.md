---
title: Landing module with local landing through NoneForge
labels: []
blocked_by: [82, 84]
parent: 8
status: open
---
Approved work lands one job at a time through a landing queue. Locally, the base only moves when the merged result passes `verify`, and dependents unblock only once their blocker has actually landed.

1. **`Forge` shrinks** to `base(branch?)`, `deliver(job)`, `poll(job)`, `doctorChecks(config)`. `findRequest`/`openRequest`/`enableAutoMerge` become private steps; the `enabled` and `remote` flags go. For this ticket GitHub/GitLab `deliver` wrap today's open-PR + auto-merge and `poll` returns `waiting` until #88/#89.
   - `deliver({ branch, sha, base, title, body })` → `landed | waiting(url) | moved | refused(reason)`
   - `poll({ branch, sha })` → `none | landed | closed | review-required | conflict | behind | ci-failed { checks } | auto-merge-off | waiting`
2. **Landing is its own module** beside the per-issue loop. The run loop feeds it approved jobs and reads back events: **landed**, **needs a merge fix**, **needs attention**. One job at a time does the host merge + deliver. It replaces `fastForwardQueue`. A run ends only when landing is empty.
3. **Host merge**: at the head of the queue, fetch and, when the base is not an ancestor of the branch, merge it in a throwaway host worktree. Then run `config.verify` in a sandbox with **no agent** (same `Sandbox`, `exec`, `close`; no provider), output through `logTail`. No formatter. Until #87, a conflict or failing `verify` is needs attention.
4. **`NoneForge` does the local landing**: `deliver` is a compare-and-swap `update-ref` of the base, plus `merge --ff-only` when the base is checked out and clean → `landed`; a lost compare-and-swap → `moved` (landing re-merges, no cap); a base checked out with uncommitted changes or any git error → `refused` → needs attention. `poll` is `landed` when `sha` is an ancestor of the base, else `none`. `fastForward`/`fastForwardBase` move out of `runner.ts` into it.
5. **Only landed unblocks dependents.** Local runs without `autoMerge` stop at approved (waiting on you) and do not unblock dependents.
6. **Resume**: approved/landing jobs from `state.json` go into landing, which re-checks with `poll` before acting (`landed` → done; `none` → deliver).
7. **Test harness**: a fake `Forge` scripting only `deliver`/`poll` per job; host merges and `NoneForge` on real temp git repos with a bare remote; `verify` through a fake `Sandbox` with scripted exit code and output; landing takes the injected `wait`.

- [ ] Regression: a failed local fast-forward no longer ends in `done`/`landed`
- [ ] `NoneForge` on real temp repos: clean CAS → `landed` with a clean checked-out base fast-forwarded; lost race (test moves the base between merge and deliver) → `moved` → re-merge → `landed`; dirty checked-out base → `refused`, checkout untouched; `poll` ancestor → `landed`, else `none`
- [ ] Fake forge: deliver → `waiting`×n → `landed`, dependents unblocked only then; `behind` → host merge + `verify` pass → deliver again with no agent; the exact SHA handed to `deliver` is asserted
- [ ] `none` on resume → deliver

Decision records: [75](75-run-loop-shape.md), [76](76-landing-path.md), [78](78-forge-seam.md), [80](80-landing-tests.md).
