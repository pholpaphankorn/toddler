---
title: How quota polling works with several sessions per provider
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 9
status: open
---
## Question

Today each `Quotas.run` starts its own 60 s `setInterval` that refreshes every provider while its session runs. With up to `maxParallelIssues` sessions, several per provider, and `scheduler.ts` owning quotas ([pick and the new ranker contract](94-pick-and-ranker-contract.md)), decide:

- One shared poller owned by the scheduler (runs while any session runs, stops when none do) vs per-session timers; how it starts and stops around `pick`/`release()`.
- Whether a poll that fails is a failed read for that provider only (block new starts, live sessions kept, per [When a stop lifts](91-stops-lift.md)) instead of today's run-wide `stop()`.
- How the poller uses the injected clock `{ now(), wait(ms) }` and is tested with it ([How scheduling is tested](96-scheduling-tests.md)).

While the run sleeps nothing polls; the `wakeAt` timer does the re-read ([Sleeping until the next reset](92-wake-at.md)).
