---
title: The run loop's shape and its idle states
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 8
status: closed
assignee: claude
---
## Question

Today `Runner.run` starts a batch, waits for every issue in it (`Promise.allSettled`), then picks again; `work` runs one issue from implementation to publish. The reshape needs: issues start as soon as a slot frees; approved work waits in a one-at-a-time landing queue; the run waits on a pending auto-merge when an open issue depends on it; and (spec 9) the run sleeps until the next quota reset when every provider is stopped ([Unattended runs from a queue](../../7-harness-boundary/issues/64-unattended-queue.md)).

What is the loop's shape? Where does the landing watcher live: its own module beside the per-issue loop, or a stage of it (passed on by spec 7)? What states can the run be in (working, waiting on a merge, sleeping, done), what ends it, and which seams does spec 9 fill in? Use codebase-design.

## Answer

Settled with phol 2026-11-26.

- **Per-issue work ends at approved.** `work` runs implement → review and stops when the job is approved; its `maxParallelIssues` slot frees at once. Slots count agent work only; landing is host work (git, `verify`, forge polls) and takes no slot.
- **Landing is its own module**, beside the per-issue loop, not a stage of it. It owns the one-at-a-time queue, the host merge + `verify` + push or fast-forward, and polling unlanded PRs. The run loop feeds it approved jobs and reads back events: **landed** (dependents may be ready), **needs a merge fix** (back for implement → review), **needs attention**. Roughly `add(job)`, wait for the next event, `idle()`; exact methods go to [The Forge seam's new methods and their local-mode equivalents](78-forge-seam.md) and [The merge fix loop](77-merge-fix-loop.md). It replaces `fastForwardQueue`.
- **A merge fix round takes a slot**, ahead of fresh issues: it is agent work like any other, and finishing approved work beats starting new work.
- **The loop is one event loop**: load state → put resumed approved/landing jobs into landing → fill free slots (merge fixes first, then ready issues) → wait for the first of: a slot frees, landing emits an event, a sleep timer fires → repeat. `Promise.allSettled` batches go; the in-memory `attempted` set goes in favour of job state.
- **Run states**: *working* (a slot busy), *waiting on landing* (no slot busy, nothing ready, landing holds work), *sleeping* (spec 9: every provider stopped), *done* (no slot busy, landing empty, nothing ready). **A run ends only when landing is empty**, even if no open issue depends on the pending PR, so a CI failure on it still gets its merge fix this run. PRs without auto-merge never enter landing (they wait for phol); local runs without `autoMerge` end at approved.
- **Failures stay with their issue.** A stage failure marks that issue needs attention; the run continues and only its dependents stay blocked. Only host faults end the run: git broken, `state.json` unwritable, runner lock lost.
- **Two seams for spec 9**: `pick(role, job) → provider | none` at each stage start, and `wakeAt() → time | none`, asked only when nothing can start and landing is idle. `maxParallelIssues` is read through the same scheduler. Until spec 9, `wakeAt` returns none and the run stops with "no provider has quota", as today.
- **SIGINT/SIGTERM**: start nothing new; in-flight stages end as today; landing finishes only the git or forge step it is in, leaves job state as is, and the next run resumes it. No half-done host merge is left behind.
- **Resume**: `state.json` says where to resume (merge fix counter and "waiting on auto-merge" persist, per [State, resume and logs](../../7-harness-boundary/issues/71-state-resume.md)); the forge or git says what is true now. Landing re-checks a resumed job's PR (or the local base) before acting, e.g. a PR merged by hand overnight goes straight to *landed*. A job mid merge fix resumes as merge fix work in a slot, keeping its counter and PR. Field shapes go to [Job states, state.json fields and the run summary](79-job-states.md).
