---
title: How quota polling works with several sessions per provider
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 9
status: closed
assignee: claude
---
## Question

Today each `Quotas.run` starts its own 60 s `setInterval` that refreshes every provider while its session runs. With up to `maxParallelIssues` sessions, several per provider, and `scheduler.ts` owning quotas ([pick and the new ranker contract](94-pick-and-ranker-contract.md)), decide:

- One shared poller owned by the scheduler (runs while any session runs, stops when none do) vs per-session timers; how it starts and stops around `pick`/`release()`.
- Whether a poll that fails is a failed read for that provider only (block new starts, live sessions kept, per [When a stop lifts](91-stops-lift.md)) instead of today's run-wide `stop()`.
- How the poller uses the injected clock `{ now(), wait(ms) }` and is tested with it ([How scheduling is tested](96-scheduling-tests.md)).

While the run sleeps nothing polls; the `wakeAt` timer does the re-read ([Sleeping until the next reset](92-wake-at.md)).

## Answer

Settled with phol 2026-11-26.

- **One poller, owned by `scheduler.ts`**, replaces the per-session `setInterval` in `Quotas.run`. It runs while total `running` > 0 (from `pick` to the last `release()`, so it also covers the gap before sandcastle starts) and stops when `running` reaches 0. Each poll refreshes every configured provider, stopped ones included ([When a stop lifts](91-stops-lift.md)). `pollIntervalMs` (default 60 s) stays the only setting.
- **Interval counts from the last refresh of any kind**: the next poll is due `pollIntervalMs` after the last refresh, so a `pick` or a wake re-read pushes it back. The `refreshing` dedupe stays; polls never overlap.
- **A stop found by a poll cancels live sessions with the same key**: thresholds and project stop conditions alike, provider-wide stops cancel every session on the provider, per-model stops only that model's. Cancelled stages go back to ready and are not counted as a round, as with a limit stop ([A provider-limit failure counted as a quota stop](93-provider-limit-failure.md)). Failed reads still cancel nothing.
- **A throwing or invalid stop-condition module** (`StopConditionError`) during any refresh is a failed read for that provider: blocks new starts, live sessions kept, lifts on the next pass where the module behaves, log names the module. Today's run-wide `stop()` on a poll error goes; `doctor` surfaces broken modules.
- **Cancellation rides on the reservation**: `pick` returns `{ provider, model, signal, release() }` (extends [pick and the new ranker contract](94-pick-and-ranker-contract.md)); the scheduler keeps each reservation's controller under its key, a stop aborts matching signals, the stage passes `signal` to sandcastle. `Quotas.run`, its timer and `Quotas.active` go; reservations replace `active`.
- **The loop drives the timer, not the scheduler**: `scheduler.nextPollAt() → time | none` (none when `running` is 0) and `scheduler.poll()`. The run loop's single wait adds "poll due" beside a slot freeing, a landing event and the sleep timer, all on the one injected clock ([How scheduling is tested](96-scheduling-tests.md)). No timer hidden in the scheduler, so the test clock's instant `wait` can't spin it.
- **Tests**: `scheduler.test.ts`: `nextPollAt()` none at 0 running, last refresh + interval otherwise, pushed back by a `pick`; `poll()` with a threshold stop aborts only same-key signals; a failed read leaves signals alone; a throwing module gives a failed read that lifts on the next good pass. `workflow.test.ts`: one loop test, slot busy → poll fires → stop cancels the stage → job back to ready, round not counted.
