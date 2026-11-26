---
title: Stops lift
labels: [parallel-safe]
blocked_by: [99]
parent: 9
status: open
---
A provider stopped for low quota comes back on its own once a reading shows quota again, and a failed quota read no longer kills the provider for the rest of the run.

1. **Stopped providers are re-read on every refresh** (each `pick`, the poll, a wake): `refresh` no longer skips them.
2. **One lifting rule**: on each fresh reading every stop condition (built-in thresholds and project modules) runs and the stops are recomputed. A stop is keyed by provider + optional model, not by its reason, and lifts when no condition returns that key. Per-model and provider-wide stops lift independently. A reason whose text changes ("4%" → "3%") is neither a lift nor a new stop.
3. **Failed quota read** ("usage could not be verified") is a stop that lifts on the next good read, retried on the same refreshes, no backoff. It **blocks new starts only and cancels no live session** (changed from today).
4. **Interrupt is not a stop**: SIGINT/SIGTERM becomes a run-level state outside the stop map that never lifts (`stop()` no longer reuses `disable(…, "runner interrupted")`).
5. **Log only transitions**: `[quota] claude stop lifted (was: <reason>)`, `[quota] claude (opus) stop lifted (was: <reason>)`.

- [ ] Scheduler tests: a stop lifts on a reading above threshold; per-model and provider-wide stops lift independently; a changed reason text is neither lift nor new stop; a failed read blocks starts, leaves live sessions, lifts on the next good read
- [ ] Interrupt still starts nothing new and is not reported as a quota stop
