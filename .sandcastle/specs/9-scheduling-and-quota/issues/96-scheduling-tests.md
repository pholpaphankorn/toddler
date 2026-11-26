---
title: How scheduling is tested
labels: [wayfinder:grilling, on-hold]
blocked_by: [92, 93, 94]
parent: 9
status: closed
assignee: claude
---
## Question

How are `pick`, the rankers, stops lifting, provider-limit failures, `wakeAt` sleeps and `plan`'s dry-run slot filling ([How plan and doctor explain a ranking or a stop](95-plan-doctor-explain.md)) tested without real providers or real time? Which fakes (readings, a clock, `wait`, CLI failure output) and which contract tests, following [How landing is tested](../../8-landing/issues/80-landing-tests.md)?

## Answer

Settled with phol 2026-11-26.

- **Where**: a new `tests/scheduler.test.ts` drives `scheduler.ts` at its seam (`admit`, `pick`, `release`, `wakeAt`) with fake readings and a fake clock. `workflow.test.ts` gets only the loop tests: sleep → wake, a limit failure sending the job back to ready, `plan`'s dry run.
- **Time**: one injected clock `{ now(), wait(ms) }` (default `Date.now` and the real timer), replacing the runner's bare `wait` and the `Date.now()` at the sleep; shared by landing's poll wait, `wakeAt` sleeps and limit-stop holds. The test `wait` moves the fake `now` by `ms` and resolves at once; sleeps are asserted from the recorded `wait` arguments. No `mock.timers` ([How landing is tested](../../8-landing/issues/80-landing-tests.md)).
- **Readings**: a per-provider queue of scripted `Reading`s or thrown errors as the `ReadUsage` (last entry repeats), built with a small `reading({ fiveHour, weekly, resetsAt, models })` helper. The API-JSON parsers keep their own table tests.
- **Rankers**: `balanced` and `most-quota` tested as plain functions over candidate tables (ties, `running` weighting, per-model weekly); the coin flip pinned with `mock.method(Math, "random", …)`. The contract stays `{ candidates } → order`, no random parameter.
- **Provider-limit fixtures**: hand-written from [What each CLI reports when a session hits the provider's own limit](90-provider-limit-signals.md) under `tests/fixtures/limits/`, each marked as written from source reading: Claude `usage_limit_reached` with a per-model `rateLimitType`, Claude `five_hour`, Claude `rate_limit` alone (throttling, not a limit), Codex usage-limit text, Codex with no parsable time. The recogniser is a pure function tested on each; one loop test feeds the lines through a fake `onAgentStreamEvent` then exits 1. A real limit's logged lines replace the fixture when one turns up; nobody exhausts quota on purpose.
- **Scheduler suite, one test each**: 0 candidates → none; 1 → no ranker call; 2+ → ranker sees `{ candidates }` only; two picks in one pass see each other's `running`, `release()` decrements; `admit` cap and non-`parallel-safe` running alone and blocking starts; sticky implementer kept, moves at once when stopped, no move back after the lift; reviewer re-picked each round; a per-model stop gives none for one role while another starts; a stop lifts on a reading above threshold; per-model and provider-wide stops lift independently; a changed reason text is neither lift nor new stop; a failed read blocks starts, leaves live sessions, lifts on the next good read; a limit stop held until its reset (30 min with none), then the normal rule; a limit stop cancels only live sessions with the same key; an ambiguous failure decided by a fresh reading (quota stop vs `stage-failed`); the interrupted stage not counted as a round; `wakeAt` = earliest reset + slack capped at 30 min, none with no stops, a limit stop's reset counts; loop: still stopped on wake → sleeps again; interrupt during a sleep ends at once.
- **Config and loader rows**: existing `tests/fixtures/ranking/` rows stay; add `"quota"`/`"order"` failing config load with the replacement named, `"balanced"`/`"most-quota"` resolving to the built-in files, `./balanced` loading a project file, default `balanced`, `maxParallelIssues` default 2.
- **`plan` and `doctor`**: exact-text tests over fixed scenarios (each stop kind with its lift line, a full slot, a non-`parallel-safe` wait, would-sleep yes and no) with `TZ=UTC`; one `--json` shape test; after plan, every provider's `running` is 0 (every `release()` ran). Doctor ranking row: built-in, project path, old value failing.
- **No real-provider smoke** for scheduling: `doctor` already reads real quota; sleeps and limits can't be triggered on demand.
- **60 s polling** with several sessions per provider graduated to [How quota polling works with several sessions per provider](97-quota-polling.md), which owns its tests; this suite reaches refresh only through `pick`, `wakeAt` and a direct `refresh()`.
