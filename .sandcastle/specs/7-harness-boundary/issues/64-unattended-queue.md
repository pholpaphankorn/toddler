---
title: "Unattended runs from a queue: keep, delegate, or drop"
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Should toddler run unattended, picking ready issues from a queue (tracker) until none are left, or should something else start the work (a human per issue, a provider's own scheduler/routines, a single orchestrator session)? What does "unattended" need to mean for phol? Inventory rows 1, 8, 9, 32 in [Inventory of toddler's features](57-feature-inventory.md).

## Answer

Settled with phol 2026-11-25. **Unattended runs stay, as code.** Picking ready issues was already code (see [One orchestrator session per batch or one session per issue](62-orchestrator-session.md)); this ticket settles what a run is and how approved work lands.

- **A run**: phol starts `toddler run` once and walks away. No questions mid-run. It works ready issues, starting the next as soon as a `maxParallelIssues` slot frees, and stops when no issue is ready or every provider has stopped. phol comes back to pull requests and issues that need attention.
- **Only phol starts a run.** No built-in scheduler and no provider routines; a timer is phol's own launchd/cron wrapper.
- **Kept as code**: the main loop (row 9); run preconditions: clean tree, runner lock, SIGINT/SIGTERM stop (row 8; the push-remote check follows [What may leave the sandbox, and who pushes it](68-what-leaves-the-sandbox.md)); resume of interrupted issues from state (row 32; the sticky implementer follows [One provider builds, the other reviews](66-cross-provider-review.md), quota hand-over follows [Quota stops](67-quota-stops.md)).
- **Landing** (new glossary term) is code:
  - **One at a time, through toddler's own queue**, locally (as `fastForwardQueue` does) and on forges (toddler enables auto-merge on one approved PR, waits for it to merge, then the next), not the forge's merge queue or merge trains.
  - **The run waits for a pending auto-merge** when an open issue depends on it, then continues with the newly ready issues.
  - **Local issue files are closed**: after the fast-forward, toddler sets the issue file to `status: closed` in its own commit on the base.
  - **Base moved, no conflict**: on a forge nothing is done; locally toddler merges the base into the branch, runs `verify`, and lands without re-review.
  - **A failed local fast-forward never ends in `done`.** Today it does ([runner.ts](../../../../src/runner.ts) `publish` → `fastForwardBase` logs "cannot fast-forward" and the job is marked `done` anyway): a bug now, whatever the reshape.
- **Merge fix loop** (code detects, agent fixes, as for row 23): for the whole run, code watches every approved issue whose auto-merge PR or local branch has not landed. Anything that blocks the merge and an agent can fix (a conflict with the base, failing CI, failing `verify` locally) goes back as implement → review on the same PR. The host fetches failing check names and log tails and gives them to the implementer as text. Its own counter from 0 and its own cap, new config **`maxMergeFixRounds`, default 10**, separate from `maxReviewRounds`; at the cap the issue goes to phol. A required human review goes to phol at once.
- **Without auto-merge** the PR waits for phol; its dependents stay blocked until phol merges them, and the next run picks them up. No merge fix loop for those PRs.
- **A stuck issue blocks only its dependents.** Everything else keeps running; toddler stops only when nothing is ready.

Passed on: a local landing is the reviewed commit plus a clean base merge, not the exact reviewed SHA, and the host fetching CI logs assumes sandboxes hold no forge token; both go to [What may leave the sandbox, and who pushes it](68-what-leaves-the-sandbox.md). The forge must read mergeability and CI status; that goes to [Forge and tracker modules](63-forge-tracker-modules.md). Whether the watcher is its own module or part of the per-issue loop is for the reshape spec.
