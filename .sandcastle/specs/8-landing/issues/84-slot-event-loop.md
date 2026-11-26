---
title: Slot-based event loop
labels: []
blocked_by: [83]
parent: 8
status: closed
---
Issues start as soon as a slot frees instead of waiting for a whole batch, and one issue's failure no longer stops the run.

1. **Per-issue work ends at approved**: implement → review until approved; the `maxParallelIssues` slot frees at once. Slots count agent work only.
2. **One event loop**: load state → fill free slots with ready issues → wait for the first of: a slot frees, a sleep timer fires → repeat. The `Promise.allSettled` batches and the in-memory `attempted` set go (job state says what was tried). Leave room for a landing event source (#85) and for merge fixes taking slots first (#87).
3. **Failures stay with their issue**: a stage failure sets `attention`, the run continues, only its dependents stay blocked. Only host faults end the run.
4. **Seams for spec 9**: `pick(role, job) → provider | none` at each stage start, and `wakeAt() → time | none`, asked only when nothing can start. Until spec 9, `wakeAt` returns none and the run stops with "no provider has quota", as today. `maxParallelIssues` is read through the same scheduler. The loop sleeps through an injected `wait(ms)` (real timer by default).
5. **SIGINT/SIGTERM**: start nothing new; in-flight stages end as today.
6. Publishing an approved job keeps today's behaviour for now (it moves to landing in #85).

- [ ] A test with 3 ready issues and 2 slots starts the third as soon as the first finishes, not after both
- [ ] A failing issue does not stop the others; its dependents stay blocked; the run ends with exit 1
- [ ] Tests pass a `wait` that resolves at once; no `mock.timers`

> From spec 9 [pick and the new ranker contract](../../9-scheduling-and-quota/issues/94-pick-and-ranker-contract.md): the seam becomes `pick(role, job) → { provider, release() } | none` (release when the stage ends) plus `admit(issue, runningIssues)` for `maxParallelIssues` and `parallel-safe`, all in a `scheduler.ts` module. Build the seam in that shape here.

Decision record: [75](75-run-loop-shape.md).
