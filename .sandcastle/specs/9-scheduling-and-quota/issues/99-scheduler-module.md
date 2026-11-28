---
title: Scheduler module at the loop's seam
labels: []
blocked_by: []
parent: 9
status: closed
---
The run loop stops reaching into quotas and the ranker: it only asks the scheduler whether an issue may start and which provider a stage gets, and every stage hands its provider back when it ends. Rankings and stops behave as today; this is the seam every later spec 9 ticket fills.

1. **New `scheduler.ts` deep module** owning `Quotas`, the ranker and reservations. The loop calls only `admit(issue, runningIssues) → boolean`, `pick(role, job) → { provider, model, signal, release() } | none` and `wakeAt()` (still none, as spec 8 left it). This replaces spec 8's `pick → provider | none`. `assignments()`, `reviewer()` and `ranked()` leave `policy.ts`; `ready()` and `reviewReport()` stay.
2. **`admit`** reads `maxParallelIssues` (new config, default 2) and the `parallel-safe` rule: an issue without the label runs only when nothing else runs and blocks other starts while it runs; labelled issues share up to the cap. A fresh issue starts only when `admit` says yes **and** `pick(implementation)` returns a provider; otherwise no job is created and it stays ready.
3. **Reservations replace `Quotas.active`**: `running` counts a provider from the moment `pick` returns it until `release()`, across roles, so slots filled in one pass see each other. `release()` runs whenever the stage ends (success, failure, cancel). The stage passes `signal` to sandcastle; a quota stop aborts matching reservations (same keys as today's `disable`/`disableModel`).
4. **One injected clock** `{ now(), wait(ms) }` (default `Date.now` and the real timer) replaces the runner's bare `wait` and its `Date.now()` calls; landing's poll wait uses it too.
5. Today's 60 s polling keeps working until its own ticket replaces it.

- [ ] New `tests/scheduler.test.ts` with a `reading({ fiveHour, weekly, resetsAt, models })` helper and a per-provider queue of scripted `Reading`s or thrown errors as the `ReadUsage` (last entry repeats); test clock whose `wait` moves `now` and resolves at once
- [ ] Tests: two picks in one pass see each other's `running`; `release()` decrements; `admit` cap; a non-`parallel-safe` issue runs alone and blocks other starts
- [ ] Config row: `maxParallelIssues` default 2
- [ ] Existing `workflow.test.ts` passes with the loop going through the scheduler
